package dev.owt.ide.settings

import com.intellij.openapi.fileChooser.FileChooserDescriptor
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.options.BoundConfigurable
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogPanel
import com.intellij.openapi.ui.TextBrowseFolderListener
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.bindSelected
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.panel
import dev.owt.ide.OwtBundle
import dev.owt.ide.OwtNotifications
import dev.owt.ide.server.OwtResolvedPath
import dev.owt.ide.server.OwtServerLocator

/**
 * Settings | Languages & Frameworks | OWT.
 *
 * The values are application-wide ([OwtSettings]); the page is registered per project only so it can
 * show what gets resolved for the current project.
 */
class OwtSettingsConfigurable(private val project: Project) :
    BoundConfigurable(OwtBundle.message("settings.display.name")) {

    private val settings = OwtSettings.getInstance()

    override fun createPanel(): DialogPanel = panel {
        row {
            checkBox(OwtBundle.message("settings.lsp.enabled"))
                .bindSelected(settings::lspEnabled)
                .comment(OwtBundle.message("settings.lsp.enabled.comment"))
        }

        group(OwtBundle.message("settings.group.server")) {
            row(OwtBundle.message("settings.node.path")) {
                cell(
                    browseField(
                        FileChooserDescriptorFactory.createSingleFileNoJarsDescriptor()
                            .withTitle(OwtBundle.message("settings.node.path.chooser"))
                    )
                )
                    .bindText(settings::nodePath)
                    .align(AlignX.FILL)
                    .comment(OwtBundle.message("settings.node.path.comment"))
            }
            row(OwtBundle.message("settings.server.path")) {
                cell(
                    browseField(
                        FileChooserDescriptorFactory.createSingleFileOrFolderDescriptor()
                            .withTitle(OwtBundle.message("settings.server.path.chooser"))
                    )
                )
                    .bindText(settings::serverPath)
                    .align(AlignX.FILL)
                    .comment(OwtBundle.message("settings.server.path.comment"))
            }
            row(OwtBundle.message("settings.server.args")) {
                textField()
                    .bindText(settings::serverArgs)
                    .align(AlignX.FILL)
                    .comment(OwtBundle.message("settings.server.args.comment"))
            }
        }

        group(OwtBundle.message("settings.group.detected")) {
            row(OwtBundle.message("settings.detected.node")) {
                label(describe(OwtServerLocator.findNode(project, settings)))
            }
            row(OwtBundle.message("settings.detected.server")) {
                label(describe(OwtServerLocator.findServerScript(project, settings)))
            }
            row(OwtBundle.message("settings.detected.tsdk")) {
                label(
                    OwtServerLocator.findTypeScriptSdk(project)?.toString()
                        ?: OwtBundle.message("settings.detected.tsdk.bundled")
                )
            }
            row {
                comment(OwtBundle.message("settings.detected.comment"))
            }
        }
    }

    override fun apply() {
        super.apply()
        OwtNotifications.reset(project)
        settings.fireChanged()
    }

    private fun browseField(descriptor: FileChooserDescriptor): TextFieldWithBrowseButton =
        TextFieldWithBrowseButton().apply { addBrowseFolderListener(TextBrowseFolderListener(descriptor, project)) }

    private fun describe(resolved: OwtResolvedPath?): String =
        if (resolved == null) OwtBundle.message("settings.detected.none")
        else OwtBundle.message("settings.detected.value", resolved.path.toString(), resolved.source.displayName)
}
