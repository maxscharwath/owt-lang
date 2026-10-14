@file:Suppress("DEPRECATION")

package dev.owt.ide.lsp

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.platform.lsp.api.ProjectWideLspServerDescriptor
import dev.owt.ide.lang.OwtFileType
import dev.owt.ide.server.OwtServerCommand
import java.nio.charset.StandardCharsets

/** `node <server>/index.js --stdio [extra args]`, one instance per project. */
class OwtLspServerDescriptor(project: Project, private val command: OwtServerCommand) :
    ProjectWideLspServerDescriptor(project, "OWT") {

    override fun isSupportedFile(file: VirtualFile): Boolean = OwtFileType.isOwtFile(file)

    override fun createCommandLine(): GeneralCommandLine =
        GeneralCommandLine(command.commandLine)
            .withParentEnvironmentType(GeneralCommandLine.ParentEnvironmentType.CONSOLE)
            .withCharset(StandardCharsets.UTF_8)
            .apply { command.workingDirectory?.let { withWorkingDirectory(it) } }

    /** `{ "typescript": { "tsdk": "<project>/node_modules/typescript/lib" } }`, or `{}` to use the bundled TypeScript. */
    override fun createInitializationOptions(): Any = command.initializationOptions()

    override fun getLanguageId(file: VirtualFile): String = "owt"
}
