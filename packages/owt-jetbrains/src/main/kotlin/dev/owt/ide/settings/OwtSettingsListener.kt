package dev.owt.ide.settings

import com.intellij.util.messages.Topic

/**
 * Application-level notification fired after the OWT settings were applied.
 * The LSP integration (loaded only when the IDE provides the LSP API) subscribes to it
 * to restart the language server with the new configuration.
 */
fun interface OwtSettingsListener {
    fun settingsChanged(settings: OwtSettings)

    companion object {
        @JvmField
        @Topic.AppLevel
        val TOPIC: Topic<OwtSettingsListener> =
            Topic(OwtSettingsListener::class.java, Topic.BroadcastDirection.NONE)
    }
}
