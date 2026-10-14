package dev.owt.ide.server

import com.intellij.openapi.application.PathManager
import java.nio.file.Files
import java.nio.file.Path

/**
 * Files shipped next to the plugin jars (`<plugin dir>/server`, `<plugin dir>/textmate`).
 * They are copied there by the Gradle build (`prepareSandbox`), so they are plain files on disk
 * once the plugin is installed and need no extraction.
 */
object OwtPluginPaths {
    /**
     * Root directory of the installed plugin (e.g. `~/.local/share/JetBrains/<IDE>/owt-jetbrains`),
     * derived from the jar this class was loaded from: `<plugin dir>/lib/owt-jetbrains-<version>.jar`.
     *
     * `PluginManagerCore.getPlugin(PluginId)` would be the obvious lookup, but it is `@ApiStatus.Internal`
     * in 2026.x and makes the Plugin Verifier fail; `PathManager.getJarForClass` is public and stable.
     */
    fun pluginDirectory(): Path? {
        val jar = PathManager.getJarForClass(OwtPluginPaths::class.java) ?: return null
        val lib = jar.parent ?: return null
        return if (Files.isRegularFile(jar) && lib.fileName?.toString() == "lib") lib.parent else null
    }

    /** The language server bundled with the plugin (`server/index.js`), if the build included it. */
    fun bundledServerScript(): Path? =
        pluginDirectory()?.resolve("server")?.resolve("index.js")?.takeIf { Files.isRegularFile(it) }

    /** The TextMate bundle directory (contains `package.json` and `syntaxes/owt.tmLanguage.json`). */
    fun textMateBundle(): Path? =
        pluginDirectory()?.resolve("textmate")?.resolve("owt")?.takeIf { Files.isRegularFile(it.resolve("package.json")) }
}
