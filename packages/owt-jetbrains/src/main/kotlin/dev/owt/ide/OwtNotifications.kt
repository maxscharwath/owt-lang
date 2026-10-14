package dev.owt.ide

import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import dev.owt.ide.settings.OwtSettingsConfigurable

object OwtNotifications {
    private const val GROUP_ID = "OWT"
    private val LAST_PROBLEM = Key.create<String>("dev.owt.ide.lastLanguageServerProblem")

    /** Shows a configuration problem once per project (until it changes or [reset] is called). */
    fun notifyServerProblemOnce(project: Project, message: String) {
        if (project.isDisposed || project.getUserData(LAST_PROBLEM) == message) return
        project.putUserData(LAST_PROBLEM, message)
        NotificationGroupManager.getInstance()
            .getNotificationGroup(GROUP_ID)
            .createNotification(OwtBundle.message("notification.server.title"), message, NotificationType.WARNING)
            .addAction(NotificationAction.createSimpleExpiring(OwtBundle.message("notification.open.settings")) {
                ShowSettingsUtil.getInstance().showSettingsDialog(project, OwtSettingsConfigurable::class.java)
            })
            .notify(project)
    }

    fun reset(project: Project) {
        project.putUserData(LAST_PROBLEM, null)
    }
}
