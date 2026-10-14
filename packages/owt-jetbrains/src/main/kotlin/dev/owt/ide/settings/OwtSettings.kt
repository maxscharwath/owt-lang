package dev.owt.ide.settings

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.util.execution.ParametersListUtil
import com.intellij.util.xmlb.XmlSerializerUtil

/**
 * Application-wide OWT settings, stored in `owt.xml` in the IDE configuration directory.
 * Shown under Settings | Languages & Frameworks | OWT.
 */
@Service(Service.Level.APP)
@State(name = "OwtSettings", storages = [Storage("owt.xml")])
class OwtSettings : PersistentStateComponent<OwtSettings.State> {

    class State {
        /** Start the OWT language server for `.owt` files. */
        var lspEnabled: Boolean = true

        /** Absolute path to a Node.js executable; empty = auto-detect. */
        var nodePath: String = ""

        /** Absolute path to the language server script (`.../dist/index.js`); empty = auto-detect. */
        var serverPath: String = ""

        /** Extra command line arguments appended after `--stdio`. */
        var serverArgs: String = ""
    }

    private var state = State()

    override fun getState(): State = state

    override fun loadState(state: State) {
        XmlSerializerUtil.copyBean(state, this.state)
    }

    var lspEnabled: Boolean
        get() = state.lspEnabled
        set(value) {
            state.lspEnabled = value
        }

    var nodePath: String
        get() = state.nodePath
        set(value) {
            state.nodePath = value.trim()
        }

    var serverPath: String
        get() = state.serverPath
        set(value) {
            state.serverPath = value.trim()
        }

    var serverArgs: String
        get() = state.serverArgs
        set(value) {
            state.serverArgs = value.trim()
        }

    /** [serverArgs] split like a shell would (quotes are honoured). */
    fun parsedServerArgs(): List<String> =
        if (serverArgs.isBlank()) emptyList() else ParametersListUtil.parse(serverArgs)

    /** Tells every subscriber (e.g. the LSP integration) that the settings changed. */
    fun fireChanged() {
        ApplicationManager.getApplication().messageBus
            .syncPublisher(OwtSettingsListener.TOPIC)
            .settingsChanged(this)
    }

    companion object {
        @JvmStatic
        fun getInstance(): OwtSettings = service()
    }
}
