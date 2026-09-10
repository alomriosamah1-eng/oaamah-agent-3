package com.osa.mah.agent

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class EmbeddedOpenCodeModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName(): String = "EmbeddedOpenCode"

  @ReactMethod
  fun start(promise: Promise) {
    EmbeddedOpenCodeServer.start()
    promise.resolve(true)
  }

  @ReactMethod
  fun stop(promise: Promise) {
    EmbeddedOpenCodeServer.stop()
    promise.resolve(true)
  }

  @ReactMethod
  fun isRunning(promise: Promise) {
    promise.resolve(EmbeddedOpenCodeServer.isRunning())
  }
}
