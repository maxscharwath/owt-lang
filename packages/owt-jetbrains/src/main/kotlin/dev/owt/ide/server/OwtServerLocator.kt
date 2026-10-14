package dev.owt.ide.server

import com.intellij.execution.configurations.PathEnvironmentVariableUtil
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.util.Computable
import com.intellij.openapi.util.Key
import com.intellij.openapi.util.SystemInfo
import com.intellij.openapi.util.text.StringUtil
import dev.owt.ide.OwtBundle
import dev.owt.ide.node.OwtNodeInterpreterProvider
import dev.owt.ide.settings.OwtSettings
import java.nio.file.Files
import java.nio.file.InvalidPathException
import java.nio.file.Path
import java.nio.file.Paths

/** Where a resolved path came from; shown in the settings page and in the logs. */
enum class OwtPathSource(private val messageKey: String) {
    SETTINGS("source.settings"),
    IDE_NODE_INTERPRETER("source.ide.node"),
    PATH("source.path"),
    PROJECT_NODE_MODULES("source.node.modules"),
    BUNDLED("source.bundled");

    val displayName: String get() = OwtBundle.message(messageKey)
}

data class OwtResolvedPath(val path: Path, val source: OwtPathSource)

/** Everything needed to spawn the language server. */
data class OwtServerCommand(
    val node: OwtResolvedPath,
    val script: OwtResolvedPath,
    val extraArgs: List<String>,
    /** `node_modules/typescript/lib` of the project, passed as `typescript.tsdk`; `null` = server's bundled TypeScript. */
    val tsdk: Path?,
    val workingDirectory: Path?,
) {
    val commandLine: List<String>
        get() = listOf(node.path.toString(), script.path.toString(), "--stdio") + extraArgs

    /** `initializationOptions` sent with the LSP `initialize` request. */
    fun initializationOptions(): Map<String, Any> =
        if (tsdk != null) mapOf("typescript" to mapOf("tsdk" to tsdk.toString())) else emptyMap()
}

sealed interface OwtServerResolution {
    data class Ready(val command: OwtServerCommand) : OwtServerResolution
    data class Failed(val message: String) : OwtServerResolution
}

/**
 * Resolves the Node.js interpreter, the language server script and the TypeScript SDK.
 *
 * Node.js: explicit setting → IDE interpreter (JavaScript plugin) → `node` on `PATH` (+ common install dirs).
 * Server:  explicit setting → `node_modules/@owt/language-server/dist/index.js` (project roots, walking up
 *          like Node's module resolution) → the copy bundled with the plugin.
 */
object OwtServerLocator {
    private val LOG = logger<OwtServerLocator>()
    private val LAST_LOGGED_COMMAND = Key.create<String>("dev.owt.ide.lastLoggedServerCommand")

    private val SERVER_RELATIVE_PATH = listOf("node_modules", "@owt", "language-server", "dist", "index.js")
    private val TSDK_RELATIVE_PATH = listOf("node_modules", "typescript", "lib")

    fun resolve(project: Project, settings: OwtSettings = OwtSettings.getInstance()): OwtServerResolution {
        val node = findNode(project, settings)
            ?: return OwtServerResolution.Failed(
                if (settings.nodePath.isNotBlank()) OwtBundle.message("error.node.invalid.setting", settings.nodePath)
                else OwtBundle.message("error.node.not.found")
            )
        val script = findServerScript(project, settings)
            ?: return OwtServerResolution.Failed(
                if (settings.serverPath.isNotBlank()) OwtBundle.message("error.server.invalid.setting", settings.serverPath)
                else OwtBundle.message("error.server.not.found")
            )
        val command = OwtServerCommand(
            node = node,
            script = script,
            extraArgs = settings.parsedServerArgs(),
            tsdk = findTypeScriptSdk(project),
            workingDirectory = project.basePath?.let(::toPath)?.takeIf { Files.isDirectory(it) },
        )
        val description = "${command.commandLine.joinToString(" ")} (node from ${node.source}, server from ${script.source}, tsdk=${command.tsdk})"
        // resolve() runs for every opened .owt file: log at INFO level only when the result changes.
        if (project.getUserData(LAST_LOGGED_COMMAND) != description) {
            project.putUserData(LAST_LOGGED_COMMAND, description)
            LOG.info("OWT language server: $description")
        }
        return OwtServerResolution.Ready(command)
    }

    fun findNode(project: Project, settings: OwtSettings = OwtSettings.getInstance()): OwtResolvedPath? {
        if (settings.nodePath.isNotBlank()) {
            // An explicit but broken setting is reported instead of silently falling back.
            return toPath(settings.nodePath)?.takeIf { Files.isRegularFile(it) }?.let { OwtResolvedPath(it, OwtPathSource.SETTINGS) }
        }
        for (provider in OwtNodeInterpreterProvider.EP_NAME.extensionList) {
            val path = runCatching { provider.findNodeInterpreter(project) }
                .onFailure { LOG.warn("Node.js interpreter provider ${provider.javaClass.name} failed", it) }
                .getOrNull()
            if (path != null) return OwtResolvedPath(path, OwtPathSource.IDE_NODE_INTERPRETER)
        }
        return findNodeOnPath()?.let { OwtResolvedPath(it, OwtPathSource.PATH) }
    }

    fun findServerScript(project: Project, settings: OwtSettings = OwtSettings.getInstance()): OwtResolvedPath? {
        if (settings.serverPath.isNotBlank()) {
            val configured = toPath(settings.serverPath) ?: return null
            // Accept either the script itself or the package / dist directory.
            val script = when {
                Files.isRegularFile(configured) -> configured
                Files.isRegularFile(configured.resolve("index.js")) -> configured.resolve("index.js")
                Files.isRegularFile(configured.resolve("dist").resolve("index.js")) -> configured.resolve("dist").resolve("index.js")
                else -> return null
            }
            return OwtResolvedPath(script, OwtPathSource.SETTINGS)
        }
        findInNodeModules(project, SERVER_RELATIVE_PATH) { Files.isRegularFile(it) }
            ?.let { return OwtResolvedPath(it, OwtPathSource.PROJECT_NODE_MODULES) }
        return OwtPluginPaths.bundledServerScript()?.let { OwtResolvedPath(it, OwtPathSource.BUNDLED) }
    }

    /** `node_modules/typescript/lib` when it contains `typescript.js`, otherwise `null`. */
    fun findTypeScriptSdk(project: Project): Path? =
        findInNodeModules(project, TSDK_RELATIVE_PATH) { Files.isRegularFile(it.resolve("typescript.js")) }

    private fun findInNodeModules(project: Project, relative: List<String>, accept: (Path) -> Boolean): Path? {
        for (root in projectRoots(project)) {
            var dir: Path? = root
            while (dir != null) {
                val candidate = relative.fold(dir) { acc, part -> acc.resolve(part) }
                if (accept(candidate)) return candidate
                dir = dir.parent
            }
        }
        return null
    }

    private fun projectRoots(project: Project): List<Path> {
        val roots = LinkedHashSet<Path>()
        project.basePath?.let(::toPath)?.let(roots::add)
        if (!project.isDisposed) {
            val contentRoots = ApplicationManager.getApplication().runReadAction(Computable {
                if (project.isDisposed) emptyArray() else ProjectRootManager.getInstance(project).contentRoots
            })
            contentRoots.filter { it.isInLocalFileSystem }.mapNotNullTo(roots) { toPath(it.path) }
        }
        return roots.filter { Files.isDirectory(it) }
    }

    private fun findNodeOnPath(): Path? {
        val executable = if (SystemInfo.isWindows) "node.exe" else "node"
        PathEnvironmentVariableUtil.findInPath(executable)?.toPath()?.let { return it }
        // GUI-launched IDEs on macOS/Linux may not see the login shell PATH; try the usual locations.
        val home = System.getProperty("user.home")
        val candidates = if (SystemInfo.isWindows) {
            listOfNotNull(
                System.getenv("ProgramFiles")?.let { "$it\\nodejs\\node.exe" },
                System.getenv("LOCALAPPDATA")?.let { "$it\\Programs\\nodejs\\node.exe" },
            )
        } else {
            listOf(
                "/opt/homebrew/bin/node",
                "/usr/local/bin/node",
                "/usr/bin/node",
                "$home/.volta/bin/node",
                "$home/.local/share/fnm/aliases/default/bin/node",
                "$home/.nvm/current/bin/node",
            )
        }
        return candidates.asSequence().mapNotNull(::toPath).firstOrNull { Files.isRegularFile(it) && Files.isExecutable(it) }
    }

    private fun toPath(value: String): Path? {
        val expanded = if (value.startsWith("~")) System.getProperty("user.home") + value.substring(1) else value
        return try {
            Paths.get(StringUtil.unquoteString(expanded.trim())).toAbsolutePath().normalize()
        } catch (_: InvalidPathException) {
            null
        }
    }
}
