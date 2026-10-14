package dev.owt.ide

import com.intellij.openapi.util.IconLoader
import javax.swing.Icon

object OwtIcons {
    /** 16x16 file icon; `owt_dark.svg` is picked up automatically for dark themes. */
    @JvmField
    val FILE: Icon = IconLoader.getIcon("/icons/owt.svg", OwtIcons::class.java)
}
