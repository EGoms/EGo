/* global StdCursor.Checkmark, StdCursor.Crossmark, StdIcon.Information, StdButton.Ok, TextAlignment.Right, TextAlignment.VertCenter, Dialog, CoreApplication, StdIcon.Question, StdButton.Cancel, FrameStyle.Sunken */

//"use strict";

/**
 * V8-safe wrapper for View.viewById().
 * In the V8 runtime View.viewById() throws on an empty/invalid identifier and
 * returns null for a non-existent view, whereas the legacy engine returned an
 * invalid (isNull) View. Callers here rely on always getting a View object, so
 * we normalize both cases back to an invalid View.
 * @param {String} viewId
 * @returns {View} The matching view, or an invalid View if not found.
 */
function viewByIdSafe(viewId){
    if (!viewId)
        return new View();
    let view = View.viewById(viewId);
    return (view === null) ? new View() : view;
}

/**
 * V8-safe wrapper for ImageWindow.previewById().
 * In the V8 runtime previewById() returns null when the preview is not found;
 * the legacy engine returned an invalid (isNull) View. Normalize to an invalid
 * View so existing .isNull checks keep working.
 * @param {ImageWindow} window
 * @param {String} previewId
 * @returns {View} The matching preview, or an invalid View if not found.
 */
function previewByIdSafe(window, previewId){
    let preview = window.previewById(previewId);
    return (preview === null) ? new View() : preview;
}

/**
 * Returns the elapsed time since startTime.
 * If the elapsed time is less than a second, it is returned as milliseconds, with a 'ms' postfix.
 * Otherwise it is returned as seconds, with a 's' postfix.
 * @param {Number} startTime
 * @returns {String} Time elapsed since startTime
 */
function getElapsedTime(startTime) {
    let totalTime = new Date().getTime() - startTime;
    if (totalTime < 1000) {
        totalTime += " ms";
    } else {
        totalTime /= 1000;
        totalTime += " s";
    }
    return totalTime;
}

/**
 * @param {String} text
 * @returns {Label} label in FrameStyle.Box
 */
function createTitleLabel(text){
    let titleLabel = new Label();
    titleLabel.frameStyle = FrameStyle.Sunken;
    titleLabel.margin = 4;
    titleLabel.wordWrapping = true;
    titleLabel.useRichText = true;
    titleLabel.text = text;
    return titleLabel;
}

/**
 * Create HorizontalSizer that contains newInstance, documentation, Cancel & OK buttons
 * @param {Dialog} dialog
 * @param {Object} data
 * @param {String} helpMsgTitle
 * @param {String} helpMsg
 * @param {String} scriptName If not null, display html file
 * @param {String} okToolTip If not null, add this tooltip to ok_Button
 * @param {Control} extraControl Added after 'Save Settings' button but before OK / Cancel buttons
 * (C:\Program Files\PixInsight\doc\scripts\scriptName\scriptName.html)
 * @returns {HorizontalSizer}
 */
function createWindowControlButtons(dialog, data, helpMsgTitle, helpMsg, scriptName, okToolTip, extraControl){
    let ok_Button = new PushButton();
    ok_Button.defaultButton = false;
    ok_Button.text = "Run";
    ok_Button.icon = dialog.scaledResource( ":/icons/power.png" );
    ok_Button.onClick = function () {
        dialog.ok();
    };
    if (okToolTip !== undefined && okToolTip !== null){
        ok_Button.toolTip = okToolTip;
    }

    let cancel_Button = new PushButton(dialog);
    cancel_Button.text = "Exit";
    cancel_Button.icon = dialog.scaledResource( ":/icons/close.png" );
    cancel_Button.onClick = function () {
        dialog.cancel();
    };

    let buttons_Sizer = new HorizontalSizer(dialog);
    buttons_Sizer.spacing = 6;

    // New Instance button
    let newInstance_Button = new ToolButton(dialog);
    newInstance_Button.icon = dialog.scaledResource(":/process-interface/new-instance.png");
    newInstance_Button.setScaledFixedSize(24, 24);
    newInstance_Button.toolTip = "Drag & Drop to desktop to create a Process Icon";
    newInstance_Button.onMousePress = function () {
        this.hasFocus = true;
        this.pushed = false;
        data.saveParameters();
        dialog.newInstance();
    };

    let browseDocumentationButton = new ToolButton(dialog);
    browseDocumentationButton.icon = dialog.scaledResource(":/process-explorer/browse-documentation.png");
    browseDocumentationButton.text = "Help";
    browseDocumentationButton.toolTip =
            "<p>Opens a browser to view the script's documentation.</p>";
    browseDocumentationButton.onClick = function () {
        if (scriptName !== undefined && scriptName !== null){
            let ok = Dialog.browseScriptDocumentation(scriptName);
            if (ok) return;
        }
        (new MessageBox(
                helpMsg,
                helpMsgTitle,
                StdIcon.Information,
                StdButton.Ok
                )).execute();
    };

    buttons_Sizer.add(newInstance_Button);
    buttons_Sizer.add(browseDocumentationButton);

    let resetButton = new ToolButton(dialog);
    resetButton.icon = dialog.scaledResource(":/icons/reload.png");
    resetButton.text = "Reset";
    resetButton.toolTip =
            "<p>Resets the dialog's parameters.</p>" +
            "<p>Saved settings are also cleared.</p>";
    resetButton.onClick = function () {
        data.resetParameters(dialog);
        resetSettings();
    };

    buttons_Sizer.add(resetButton);
    if (extraControl !== undefined){
        buttons_Sizer.addSpacing(40);
        buttons_Sizer.add(extraControl);
    }
    buttons_Sizer.addStretch();
    buttons_Sizer.add(ok_Button);
    buttons_Sizer.add(cancel_Button);
    return buttons_Sizer;
}

function createGroupBox(dialog, title){
    let groupBox = new GroupBox(dialog);
    groupBox.title = title;
    groupBox.sizer = new VerticalSizer;
    groupBox.sizer.margin = 6;
    groupBox.sizer.spacing = 6;
    return groupBox;
}
