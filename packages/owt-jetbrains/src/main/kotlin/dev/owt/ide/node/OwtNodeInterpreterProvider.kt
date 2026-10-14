package dev.owt.ide.node

import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.project.Project
import java.nio.file.Path

/**
 * Supplies the Node.js interpreter configured in the IDE.
 *
 * The implementation backed by the JavaScript plugin (`NodeJsInterpreterManager`) lives in
 * `owt-javascript.xml`, which is only loaded when that plugin is installed, so the core plugin never
 * touches JavaScript plugin classes directly.
 */
interface OwtNodeInterpreterProvider {
    /** Absolute path of a local `node` executable, or `null` when none is configured. */
    fun findNodeInterpreter(project: Project): Path?

    companion object {
        @JvmField
        val EP_NAME: ExtensionPointName<OwtNodeInterpreterProvider> =
            ExtensionPointName.create("dev.owt.lang.nodeInterpreterProvider")
    }
}
