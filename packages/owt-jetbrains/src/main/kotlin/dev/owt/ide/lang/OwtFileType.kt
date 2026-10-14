package dev.owt.ide.lang

import com.intellij.openapi.fileTypes.LanguageFileType
import com.intellij.openapi.vfs.VirtualFile
import dev.owt.ide.OwtBundle
import dev.owt.ide.OwtIcons
import javax.swing.Icon

object OwtFileType : LanguageFileType(OwtLanguage) {
    const val EXTENSION: String = "owt"

    override fun getName(): String = "OWT"

    override fun getDescription(): String = OwtBundle.message("filetype.owt.description")

    override fun getDefaultExtension(): String = EXTENSION

    override fun getIcon(): Icon = OwtIcons.FILE

    fun isOwtFile(file: VirtualFile): Boolean =
        file.fileType == this || file.extension.equals(EXTENSION, ignoreCase = true)
}
