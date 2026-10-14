@file:Suppress("DEPRECATION")

package dev.owt.ide.lsp

import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.platform.lsp.api.LspServer
import com.intellij.platform.lsp.api.LspServerSupportProvider
import com.intellij.platform.lsp.api.lsWidget.LspServerWidgetItem
import dev.owt.ide.OwtIcons
import dev.owt.ide.OwtNotifications
import dev.owt.ide.lang.OwtFileType
import dev.owt.ide.server.OwtServerLocator
import dev.owt.ide.server.OwtServerResolution
import dev.owt.ide.settings.OwtSettings
import dev.owt.ide.settings.OwtSettingsConfigurable

/**
 * Starts one project-wide OWT language server as soon as an `.owt` file is opened.
 *
 * Uses the `LspServerSupportProvider` / `LspServerDescriptor` API (2023.2+). Since 2026.1.4 these are
 * deprecated aliases of `LspIntegrationProvider` / `LspClientDescriptor` but remain fully functional,
 * which keeps a single binary compatible with 2025.2.1 … 2026.x.
 */
class OwtLspServerSupportProvider : LspServerSupportProvider {
    override fun fileOpened(
        project: Project,
        file: VirtualFile,
        serverStarter: LspServerSupportProvider.LspServerStarter,
    ) {
        if (!OwtFileType.isOwtFile(file)) return
        val settings = OwtSettings.getInstance()
        if (!settings.lspEnabled) return

        when (val resolution = OwtServerLocator.resolve(project, settings)) {
            is OwtServerResolution.Ready ->
                serverStarter.ensureServerStarted(OwtLspServerDescriptor(project, resolution.command))

            is OwtServerResolution.Failed ->
                OwtNotifications.notifyServerProblemOnce(project, resolution.message)
        }
    }

    override fun createLspServerWidgetItem(lspServer: LspServer, currentFile: VirtualFile?): LspServerWidgetItem =
        LspServerWidgetItem(lspServer, currentFile, OwtIcons.FILE, OwtSettingsConfigurable::class.java)
}
