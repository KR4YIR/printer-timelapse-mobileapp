package expo.modules.foregroundservice

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoForegroundServiceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoForegroundService")

    AsyncFunction("startTimelapseForeground") { options: Map<String, Any?> ->
      val ctx = appContext.reactContext ?: return@AsyncFunction null
      TimelapseForegroundService.start(ctx, options)
      null
    }

    AsyncFunction("stopTimelapseForeground") {
      val ctx = appContext.reactContext ?: return@AsyncFunction null
      TimelapseForegroundService.stop(ctx)
      null
    }
  }
}