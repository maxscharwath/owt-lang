package dev.owt.ide.lang

import com.intellij.lang.Commenter

/**
 * `//` line comments and `/* */` block comments. HTML-style `<!-- -->` comments are valid
 * inside markup, but the script-style ones work everywhere in an `.owt` file.
 */
class OwtCommenter : Commenter {
    override fun getLineCommentPrefix(): String = "//"

    override fun getBlockCommentPrefix(): String = "/*"

    override fun getBlockCommentSuffix(): String = "*/"

    override fun getCommentedBlockCommentPrefix(): String? = null

    override fun getCommentedBlockCommentSuffix(): String? = null
}
