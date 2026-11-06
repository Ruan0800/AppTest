package expo.modules.vigintellistener

import android.content.Context

internal object ListenerRuntime {
  @Volatile var status: String = "idle"
  @Volatile var reason: String? = null
  @Volatile var partial: String? = null

  fun update(
    context: Context,
    status: String,
    reason: String? = null,
    partial: String? = this.partial
  ) {
    this.status = status
    this.reason = reason
    this.partial = partial
    ListenerBridge.emitStatus(snapshot(context))
  }

  fun snapshot(context: Context): Map<String, Any?> = mapOf(
    "status" to status,
    "protectionEnabled" to ListenerPrefs.isEnabled(context),
    "reason" to reason,
    "partial" to partial,
    "phraseCount" to ListenerPrefs.phrases(context).size
  )
}

internal object ListenerBridge {
  @Volatile private var module: VigintelListenerModule? = null

  fun attach(module: VigintelListenerModule) {
    this.module = module
  }

  fun detach(module: VigintelListenerModule) {
    if (this.module === module) this.module = null
  }

  fun emitStatus(payload: Map<String, Any?>) {
    module?.sendEvent("onStatusChange", payload)
  }

  fun emitDetection(payload: Map<String, Any?>) {
    module?.sendEvent("onDetection", payload)
  }
}
