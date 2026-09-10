package com.osa.mah.agent

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.ServerSocket
import java.net.Socket
import java.net.URL
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlin.concurrent.thread

/**
 * Minimal Android-local OpenCode transport. It intentionally implements only
 * the protocol used by the Osamah app: health, model discovery, sessions and
 * session messages. The model request uses the same OpenCode Zen session
 * headers as the official OpenCode server; no local model is bundled.
 */
object EmbeddedOpenCodeServer {
  private const val PORT = 4096
  private const val ZEN_URL = "https://opencode.ai/zen/v1/chat/completions"
  private const val USER_AGENT = "opencode/1.18.30"
  private var server: ServerSocket? = null
  private var acceptThread: Thread? = null
  private val sessions = ConcurrentHashMap<String, MutableList<JSONObject>>()

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
    } catch (_: IOException) {
      // A previous process may own the port; the app will still try localhost.
    }
  }

  fun stop() {
    try { server?.close() } catch (_: IOException) {}
    server = null
    acceptThread = null
    sessions.clear()
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
        val response = route(method, path, body)
        writeJson(output, response.first, response.second)
      } catch (e: Exception) {
        writeJson(output, 500, JSONObject().put("error", e.message ?: "embedded server error"))
      }
    }
  }

  private fun route(method: String, path: String, body: String): Pair<Int, JSONObject> {
    if (method == "GET" && path == "/global/health") {
      return 200 to JSONObject().put("healthy", true).put("version", "embedded-opencode-1")
    }
    if (method == "GET" && path == "/api/model") {
      val models = JSONArray()
      listOf("big-pickle", "ling-3.0-flash-fin-free", "deepseek-v4-flash-free").forEach {
        models.put(JSONObject().put("id", it).put("providerID", "opencode").put("name", it).put("enabled", true))
      }
      return 200 to JSONObject().put("data", models)
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
    if (method == "GET" && path == "/event") {
      // The JS client treats a failed event stream as non-fatal and consumes
      // the completed response. Return an empty stream-compatible response.
      return 200 to JSONObject().put("ok", true)
    }
    if (method == "POST" && path == "/session") {
      val id = "ses_" + UUID.randomUUID().toString().replace("-", "").take(20)
      sessions[id] = mutableListOf()
      return 200 to JSONObject().put("id", id).put("title", JSONObject(body).optString("title", "Osamah agent"))
    }
    if (method == "POST" && path.startsWith("/session/") && path.endsWith("/abort")) {
      return 200 to JSONObject().put("ok", true)
    }
    if (method == "POST" && path.startsWith("/session/") && path.endsWith("/message")) {
      val id = path.removePrefix("/session/").removeSuffix("/message").trim('/')
      if (!sessions.containsKey(id)) return 404 to JSONObject().put("error", "session not found")
      val request = JSONObject(body)
      val parts = request.optJSONArray("parts") ?: JSONArray()
      val prompt = if (parts.length() > 0) parts.optJSONObject(0)?.optString("text", "") ?: "" else ""
      val model = request.optJSONObject("model")?.optString("modelID", "big-pickle") ?: "big-pickle"
      val answer = zenCompletion(id, model, prompt)
      sessions[id]?.add(JSONObject().put("role", "user").put("content", prompt))
      sessions[id]?.add(JSONObject().put("role", "assistant").put("content", answer))
      return 200 to JSONObject().put("parts", JSONArray().put(JSONObject().put("type", "text").put("text", answer)))
    }
    return 404 to JSONObject().put("error", "not found")
  }

  private fun zenCompletion(sessionId: String, model: String, prompt: String): String {
    val messages = JSONArray()
    sessions[sessionId]?.forEach { item ->
      messages.put(JSONObject().put("role", item.optString("role")).put("content", item.optString("content")))
    }
    messages.put(JSONObject().put("role", "user").put("content", prompt))
    val payload = JSONObject().put("model", model).put("messages", messages).put("stream", false).put("max_tokens", 2400)
    val connection = (URL(ZEN_URL).openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = 15_000
      readTimeout = 120_000
      doOutput = true
      setRequestProperty("Content-Type", "application/json")
      setRequestProperty("x-opencode-project", "global")
      setRequestProperty("x-opencode-session", sessionId)
      setRequestProperty("x-opencode-request", "req_$sessionId")
      setRequestProperty("x-opencode-client", "osamah-android")
      setRequestProperty("User-Agent", USER_AGENT)
    }
    connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
    val code = connection.responseCode
    val stream = if (code in 200..299) connection.inputStream else connection.errorStream
    val raw = stream?.bufferedReader()?.use { it.readText() } ?: ""
    if (code !in 200..299) throw IOException("OpenCode Zen HTTP $code: ${raw.take(300)}")
    val json = JSONObject(raw)
    val choices = json.optJSONArray("choices") ?: throw IOException("OpenCode Zen returned no choices")
    val content = choices.optJSONObject(0)?.optJSONObject("message")?.optString("content", "")?.trim() ?: ""
    if (content.isEmpty()) throw IOException("OpenCode Zen returned an empty response")
    return content
  }

  private fun readLine(input: BufferedInputStream): String? {
    val bytes = ArrayList<Byte>()
    while (true) {
      val b = input.read()
      if (b < 0) return if (bytes.isEmpty()) null else bytes.toByteArray().toString(Charsets.ISO_8859_1)
      if (b == '\n'.code) break
      if (b != '\r'.code) bytes.add(b.toByte())
    }
    return bytes.toByteArray().toString(Charsets.ISO_8859_1)
  }

  private fun readBody(input: BufferedInputStream, length: Int): String {
    val data = ByteArray(length)
    var offset = 0
    while (offset < length) {
      val count = input.read(data, offset, length - offset)
      if (count < 0) break
      offset += count
    }
    return data.copyOf(offset).toString(Charsets.UTF_8)
  }

  private fun writeJson(output: BufferedOutputStream, status: Int, body: JSONObject) {
    val bytes = body.toString().toByteArray(Charsets.UTF_8)
    val statusText = if (status == 200) "OK" else "Error"
    val header = "HTTP/1.1 $status $statusText\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n"
    output.write(header.toByteArray(Charsets.ISO_8859_1))
    output.write(bytes)
    output.flush()
  }
}
