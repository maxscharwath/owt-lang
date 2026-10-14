package dev.owt.ide.node.javascript

import com.intellij.javascript.nodejs.interpreter.NodeJsInterpreterManager
import com.intellij.javascript.nodejs.interpreter.local.NodeJsLocalInterpreter
import com.intellij.openapi.project.Project
import dev.owt.ide.node.OwtNodeInterpreterProvider
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths

/**
 * Uses the interpreter selected in Settings | Languages & Frameworks | Node.js.
 * Registered from `owt-javascript.xml`, i.e. only when the JavaScript plugin is available.
 * Remote interpreters (WSL, Docker, SSH) are ignored: the language server is started locally.
 */
class OwtJsNodeInterpreterProvider : OwtNodeInterpreterProvider {
    override fun findNodeInterpreter(project: Project): Path? {
        val interpreter = NodeJsInterpreterManager.getInstance(project).interpreter ?: return null
        val local = interpreter as? NodeJsLocalInterpreter ?: return null
        val path = runCatching { Paths.get(local.interpreterSystemDependentPath) }.getOrNull() ?: return null
        return path.takeIf { Files.isRegularFile(it) }
    }
}
