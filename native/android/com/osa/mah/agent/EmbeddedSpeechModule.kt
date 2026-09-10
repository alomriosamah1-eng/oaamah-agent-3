package com.osa.mah.agent

import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.Locale

class EmbeddedSpeechModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName(): String = "EmbeddedSpeech"
  private var recognizer: SpeechRecognizer? = null

  @ReactMethod
  fun recognize(localeTag: String, promise: Promise) {
    if (!SpeechRecognizer.isRecognitionAvailable(context)) {
      promise.reject("UNAVAILABLE", "Android speech recognition is unavailable")
      return
    }
    val recognizer = SpeechRecognizer.createSpeechRecognizer(context)
    this.recognizer = recognizer
    recognizer.setRecognitionListener(object : RecognitionListener {
      override fun onReadyForSpeech(params: Bundle?) = Unit
      override fun onBeginningOfSpeech() = Unit
      override fun onRmsChanged(rmsdB: Float) = Unit
      override fun onBufferReceived(buffer: ByteArray?) = Unit
      override fun onEndOfSpeech() = Unit
      override fun onPartialResults(partialResults: Bundle?) = Unit
      override fun onEvent(eventType: Int, params: Bundle?) = Unit
      override fun onError(error: Int) {
        recognizer.destroy()
        this@EmbeddedSpeechModule.recognizer = null
        promise.reject("RECOGNITION_ERROR", "Android speech recognizer error $error")
      }
      override fun onResults(results: Bundle?) {
        val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim().orEmpty()
        recognizer.destroy()
        this@EmbeddedSpeechModule.recognizer = null
        if (text.isEmpty()) promise.reject("EMPTY_RESULT", "No speech was recognized") else promise.resolve(text)
      }
    })
    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_LANGUAGE, localeTag.ifBlank { Locale.getDefault().toLanguageTag() })
      putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
    }
    recognizer.startListening(intent)
  }

  @ReactMethod
  fun cancel(promise: Promise) {
    recognizer?.cancel()
    recognizer?.destroy()
    recognizer = null
    promise.resolve(true)
  }
}
