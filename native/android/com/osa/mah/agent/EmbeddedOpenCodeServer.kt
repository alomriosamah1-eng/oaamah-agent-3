package com.osa.mah.agent

import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.BufferedReader
import java.io.BufferedWriter
import java.io.IOException
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.ServerSocket
import java.net.Socket
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

/**
 * Android-local OpenCode transport for the Osamah app.
 *
 * This process does NOT contain the OpenCode binary itself (no Android build of
 * it exists; it also bundles no model). What it provides is the same HTTP
 * surface the app's JS client expects (utils/Opencode.ts) backed by the REAL
 * OpenCode Zen gateway (https://opencode.ai/zen/v1):
 *
 *   GET  /global/health            -> healthy:true
 *   GET  /api/model                -> live catalog proxied from Zen /v1/models
 *   GET  /global/config            -> provider stub (client uses /api/model)
 *   POST /session                  -> create an in-memory session
 *   POST /session/:id/message      -> prompt; forwarded to Zen with stream=true
 *   GET  /event                    -> SSE relay of message.part.updated frames
 *   POST /session/:id/abort        -> stop the in-flight Zen request
 *   GET  /voice/status             -> android STT/TTS providers
 *   POST /voice/tts|transcribe     -> 501 (native Android TTS/STT used instead)
 *
 * A nearby official `opencode serve` on the LAN replaces this automatically:
 * the JS client probes 127.0.0.1:4096 first (this server), then
 * EXPO_PUBLIC_OPENCODE_URL, then opencode.local / LAN hosts. Same protocol.
 */
object EmbeddedOpenCodeServer {
  private const val TAG = "OsamahEmbedded"
  private const val PORT = 4096
  private const val ZEN_BASE = "https://opencode.ai"
  private const val ZEN_MODELS = "$ZEN_BASE/zen/v1/models"
  private const val ZEN_CHAT = "$ZEN_BASE/zen/v1/chat/completions"
  private const val USER_AGENT = "osamah-agent-android/1.0"
  // Verified live (2026-09-11): the only free model returning HTTP 200 on the
  // Zen free tier at audit time. The JS client re-orders its chain around it.
  private const val DEFAULT_MODEL = "big-pickle"
  private const val MAX_TOKENS = 2400
  private const val CATALOG_TTL_MS = 10 * 60 * 1000L

  private var server: ServerSocket? = null
  private var acceptThread: Thread? = null
  private val sessions = ConcurrentHashMap<String, MutableList<JSONObject>>()
  private val aborted = ConcurrentHashMap<String, AtomicBoolean>()
  private val sseClients = CopyOnWriteArrayList<BufferedWriter>()
  private val sseLock = Any()

  // Cached Zen model catalog (never fabricated; empty until first fetch).
  private var catalogJson: JSONObject? = null
  private var catalogAt: Long = 0

  fun start() {
    if (server != null) return
    try {
      val socket = ServerSocket(PORT, 32, java.net.InetAddress.getByName("127.0.0.1"))
      server = socket
      acceptThread = thread(name = "osamah-opencode-local", start = true) {
        while (!socket.isClosed) {
          try {
            val client = socket.accept()
            thread(name = "osamah-opencode-request", start = true) { handle(client) }
          } catch (_: IOException) {
            break
          }
        }
      }
      Log.i(TAG, "embedded transport listening on 127.0.0.1:$PORT")
    } catch (e: IOException) {
      // Another server may own the port. The JS client falls through to other
      // candidates; log it so a phone-side diagnosis is possible.
      Log.w(TAG, "could not bind 127.0.0.1:$PORT: ${e.message}")
    }
  }

  fun stop() {
    closeSseClients()
    aborted.keys.forEach { aborted[it]?.set(true) }
    try { server?.close() } catch (_: IOException) {}
    server = null
    acceptThread = null
    sessions.clear()
    Log.i(TAG, "embedded transport stopped")
  }

  fun isRunning(): Boolean = server?.isClosed == false

  private fun handle(socket: Socket) {
    socket.use { client ->
      client.soTimeout = 120_000
      val input = BufferedInputStream(client.getInputStream())
      val output = BufferedOutputStream(client.getOutputStream())
      try {
        val requestLine = readLine(input) ?: return
        val parts = requestLine.split(" ")
        if (parts.size < 2) return
        val method = parts[0]
        val path = parts[1].substringBefore('?')
        val headers = mutableMapOf<String, String>()
        while (true) {
          val line = readLine(input) ?: return
          if (line.isEmpty()) break
          val colon = line.indexOf(':')
          if (colon > 0) headers[line.substring(0, colon).lowercase()] = line.substring(colon + 1).trim()
        }
        val length = headers["content-length"]?.toIntOrNull() ?: 0
        val body = if (length > 0) readBody(input, length) else ""

        if (method == "GET" && path == "/event") {
          serveEventStream(output)
          return
        }

        val response = route(method, path, body)
        writeJson(output, response.first, response.second)
      } catch (e: Exception) {
        Log.w(TAG, "request error: ${e.message}")
        try {
          writeJson(output, 500, JSONObject().put("error", e.message ?: "embedded server error"))
        } catch (_: Exception) { /* client already gone */ }
      }
    }
  }

  private fun route(method: String, path: String, body: String): Pair<Int, JSONObject> {
    if (method == "GET" && path == "/global/health") {
      return 200 to JSONObject().put("healthy", true).put("version", "embedded-transport-2")
    }
    if (method == "GET" && path == "/api/model") {
      return 200 to modelsCatalog()
    }
    if (method == "GET" && path == "/global/config") {
      return 200 to JSONObject().put("provider", JSONObject().put("opencode", JSONObject().put("models", JSONObject())))
    }
    if (method == "GET" && path == "/voice/status") {
      return 200 to JSONObject()
        .put("ok", true)
        .put("providers", JSONArray().put("android-tts").put("android-stt"))
        .put("voices", JSONObject())
        .put("default_voice", "android")
    }
    if (method == "POST" && path == "/voice/tts") {
      return 501 to JSONObject().put("error", "android uses native TTS; external gateway runs on 8100")
    }
    if (method == "POST" && path == "/voice/transcribe") {
      return 501 to JSONObject().put("error", "android uses the native SpeechRecognizer")
    }
    if (method == "POST" && path == "/session") {
      val id = "ses_" + UUID.randomUUID().toString().replace("-", "").take(20)
      sessions[id] = mutableListOf()
      aborted[id] = AtomicBoolean(false)
      return 200 to JSONObject().put("id", id).put("title", JSONObject(body).optString("title", "Osamah agent"))
    }
    if (method == "POST" && path.startsWith("/session/") && path.endsWith("/abort")) {
      val id = path.removePrefix("/session/").removeSuffix("/abort").trim('/')
      aborted[id]?.set(true)
      return 200 to JSONObject().put("ok", true)
    }
    if (method == "POST" && path.startsWith("/session/") && path.endsWith("/message")) {
      val id = path.removePrefix("/session/").removeSuffix("/message").trim('/')
      if (!sessions.containsKey(id)) return 404 to JSONObject().put("error", "session not found")
      return messageResponse(id, body)
    }
    return 404 to JSONObject().put("error", "not found")
  }

  // ---- model catalog (proxied from Zen, cached) ----
  private fun modelsCatalog(): JSONObject {
    synchronized(this) {
      if (catalogJson != null && System.currentTimeMillis() - catalogAt < CATALOG_TTL_MS) return catalogJson!!
    }
    var cached: JSONObject? = null
    try {
      val connection = (URL(ZEN_MODELS).openConnection() as HttpURLConnection).apply {
        requestMethod = "GET"
        connectTimeout = 10_000
        readTimeout = 15_000
        setRequestProperty("User-Agent", USER_AGENT)
        setRequestProperty("Accept", "application/json")
      }
      val code = connection.responseCode
      val stream = if (code in 200..299) connection.inputStream else connection.errorStream
      val raw = stream?.bufferedReader()?.use { it.readText() } ?: ""
      connection.disconnect()
      if (code !in 200..299) throw IOException("zen models HTTP $code")
      val root = JSONObject(raw)
      val data = root.optJSONArray("data") ?: JSONArray()
      val out = JSONArray()
      for (i in 0 until data.length()) {
        val item = data.optJSONObject(i) ?: continue
        val mid = item.optString("id", "").trim()
        if (mid.isEmpty()) continue
        out.put(JSONObject()
          .put("id", mid)
          .put("providerID", "opencode")
          .put("name", mid)
          .put("enabled", true))
      }
      cached = JSONObject().put("data", out)
      synchronized(this) {
        catalogJson = cached
        catalogAt = System.currentTimeMillis()
      }
      Log.i(TAG, "refreshed zen model catalog (${out.length()} models)")
    } catch (e: Exception) {
      Log.w(TAG, "model catalog refresh failed: ${e.message}; returning empty (never fabricated)")
      cached = JSONObject().put("data", JSONArray())
    }
    return cached ?: JSONObject().put("data", JSONArray())
  }

  // ---- message handling with REAL streaming ----
  private fun messageResponse(sessionId: String, body: String): Pair<Int, JSONObject> {
    val request = JSONObject(body)
    val parts = request.optJSONArray("parts") ?: JSONArray()
    val prompt = if (parts.length() > 0) parts.optJSONObject(0)?.optString("text", "") ?: "" else ""
    val model = request.optJSONObject("model")?.optString("modelID", DEFAULT_MODEL)?.takeIf { it.isNotBlank() } ?: DEFAULT_MODEL
    if (prompt.isBlank()) return 400 to JSONObject().put("error", "empty prompt")

    val messages = JSONArray()
    sessions[sessionId]?.forEach { item ->
      messages.put(JSONObject().put("role", item.optString("role")).put("content", item.optString("content")))
    }
    messages.put(JSONObject().put("role", "user").put("content", prompt))

    val answer = try {
      zenStreamChat(sessionId, model, messages)
    } catch (e: Exception) {
      return 502 to JSONObject().put("error", e.message ?: "zen request failed")
    }

    sessions[sessionId]?.add(JSONObject().put("role", "user").put("content", prompt))
    sessions[sessionId]?.add(JSONObject().put("role", "assistant").put("content", answer))
    aborted[sessionId]?.set(false)
    return 200 to JSONObject().put("parts", JSONArray().put(JSONObject().put("type", "text").put("text", answer)))
  }

  /**
   * Calls Zen with stream=true, accumulates content deltas, and broadcasts the
   * assistant's growing text as opencode-compatible SSE frames so the app's
   * `streamMessage()` (utils/Opencode.ts) renders token-by-token.
   */
  private fun zenStreamChat(sessionId: String, model: String, messages: JSONArray): String {
    val assistantId = "msg_" + UUID.randomUUID().toString().replace("-", "").take(16)
    val payload = JSONObject()
      .put("model", model)
      .put("messages", messages)
      .put("stream", true)
      .put("max_tokens", MAX_TOKENS)
    val connection = (URL(ZEN_CHAT).openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = 15_000
      readTimeout = 120_000
      doOutput = true
      setRequestProperty("Content-Type", "application/json")
      setRequestProperty("User-Agent", USER_AGENT)
      // Zen's free tier requires the OpenCode session headers; this ties the
      // request to a real OpenCode session (kept honest: UA is ours, not spoofed).
      setRequestProperty("x-opencode-project", "global")
      setRequestProperty("x-opencode-session", sessionId)
      setRequestProperty("x-opencode-request", "req_$sessionId")
      setRequestProperty("x-opencode-client", "osamah-android")
    }
    connection.outputStream.use { it.write(payload.toString().toByteArray(StandardCharsets.UTF_8)) }
    // Announce the assistant message first so the client can filter parts by ID.
    emit(sessionId, "message.updated", JSONObject()
      .put("sessionID", sessionId)
      .put("info", JSONObject().put("id", assistantId).put("role", "assistant")))
    val full = StringBuilder()
    try {
      val code = connection.responseCode
      val stream = if (code in 200..299) connection.inputStream else connection.errorStream
      val reader = stream?.bufferedReader() ?: throw IOException("zen HTTP $code: no body")
      reader.useLines { lines ->
        for (line in lines) {
          if (aborted[sessionId]?.get() == true) {
            connection.disconnect()
            throw IOException("aborted by user")
          }
          val trimmed = line.trim()
          if (!trimmed.startsWith("data:")) continue
          val data = trimmed.removePrefix("data:").trim()
          if (data == "[DONE]") break
          val delta = try {
            val obj = JSONObject(data)
            obj.optJSONArray("choices")?.optJSONObject(0)?.optJSONObject("delta")?.optString("content", "")
          } catch (_: Exception) { "" }
          if (!delta.isNullOrEmpty()) {
            full.append(delta)
            emit(sessionId, "message.part.updated", JSONObject()
              .put("sessionID", sessionId)
              .put("part", JSONObject()
                .put("messageID", assistantId)
                .put("type", "text")
                .put("text", full.toString())))
          }
        }
      }
      if (full.isEmpty()) throw IOException("zen returned an empty response for model $model")
    } finally {
      connection.disconnect()
      aborted[sessionId]?.set(false)
    }
    return full.toString()
  }

  // ---- SSE broadcast ----
  private fun serveEventStream(output: BufferedOutputStream) {
    val writer = BufferedWriter(OutputStreamWriter(output, StandardCharsets.UTF_8))
    sseClients.add(writer)
    try {
      val head = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: keep-alive\r\n\r\n: connected\n\n"
      synchronized(sseLock) {
        writer.write(head)
        writer.flush()
      }
      while (true) {
        Thread.sleep(15_000)
        synchronized(sseLock) {
          writer.write(": ping\n\n")
          writer.flush()
        }
      }
    } catch (_: Exception) {
      // client disconnected
    } finally {
      closeQuietly(writer)
      sseClients.remove(writer)
    }
  }

  private fun emit(sessionId: String, type: String, props: JSONObject) {
    props.put("sessionID", sessionId)
    val frame = "data: " + JSONObject().put("type", type).put("properties", props).toString() + "\n\n"
    for (writer in sseClients) {
      try {
        synchronized(sseLock) {
          writer.write(frame)
          writer.flush()
        }
      } catch (_: Exception) { /* drop dead client */ }
    }
  }

  private fun closeSseClients() {
    for (writer in sseClients) closeQuietly(writer)
    sseClients.clear()
  }

  private fun closeQuietly(writer: BufferedWriter) {
    try { writer.close() } catch (_: Exception) {}
  }

  private fun readLine(input: BufferedInputStream): String? {
    val bytes = ArrayList<Byte>()
    while (true) {
      val b = input.read()
      if (b < 0) return if (bytes.isEmpty()) null else bytes.toByteArray().toString(StandardCharsets.ISO_8859_1)
      if (b == '\n'.code) break
      if (b != '\r'.code) bytes.add(b.toByte())
    }
    return bytes.toByteArray().toString(StandardCharsets.ISO_8859_1)
  }

  private fun readBody(input: BufferedInputStream, length: Int): String {
    val data = ByteArray(length)
    var offset = 0
    while (offset < length) {
      val count = input.read(data, offset, length - offset)
      if (count < 0) break
      offset += count
    }
    return data.copyOf(offset).toString(StandardCharsets.UTF_8)
  }

  private fun writeJson(output: BufferedOutputStream, status: Int, body: JSONObject) {
    val bytes = body.toString().toByteArray(StandardCharsets.UTF_8)
    val statusText = if (status == 200) "OK" else "Error"
    val header = "HTTP/1.1 $status $statusText\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n"
    output.write(header.toByteArray(StandardCharsets.ISO_8859_1))
    output.write(bytes)
    output.flush()
  }
}
