package dev.owt.ide.textmate

import com.intellij.openapi.diagnostic.logger
import dev.owt.ide.server.OwtPluginPaths
import org.jetbrains.plugins.textmate.api.TextMateBundleProvider

/**
 * Registers the OWT TextMate bundle (`<plugin dir>/textmate/owt`: `package.json`,
 * `language-configuration.json`, `syntaxes/owt.tmLanguage.json`) with the TextMate plugin.
 *
 * Loaded from `owt-textmate.xml`, i.e. only when the TextMate plugin is enabled.
 */
class OwtTextMateBundleProvider : TextMateBundleProvider {
    override fun getBundles(): List<TextMateBundleProvider.PluginBundle> {
        val bundle = OwtPluginPaths.textMateBundle()
        if (bundle == null) {
            LOG.warn("OWT TextMate bundle not found in ${OwtPluginPaths.pluginDirectory()}; .owt files will not be highlighted")
            return emptyList()
        }
        return listOf(TextMateBundleProvider.PluginBundle("OWT", bundle))
    }

    private companion object {
        private val LOG = logger<OwtTextMateBundleProvider>()
    }
}
