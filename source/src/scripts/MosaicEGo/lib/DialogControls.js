/* global NumericControl */

//"use strict";

/**
 * @param {PhotometricMosaicDialog} dialog
 * @param {type} values
 * @param {Number} strLength
 * @returns {NumericControl}
 */
function createNumericControl(dialog, values, strLength){
    let control = new NumericControl(dialog);
    control.real = values.real;
    control.label.text = values.text;
    if (strLength > 0){
        control.label.minWidth = strLength;
    }
    control.toolTip = values.toolTip;
    control.setRange(values.range.min, values.range.max);
    control.slider.setRange(values.slider.range.min, values.slider.range.max);
    control.setPrecision(values.precision);
    let maxWidth = dialog.logicalPixelsToPhysical(values.maxWidth);
    control.maxWidth = Math.max(strLength + 50, maxWidth);
    return control;
}

/**
 * @param {PhotometricMosaicDialog} dialog
 * @param {type} values
 * @returns {NumericEdit}
 */
function createNumericEdit(dialog, values){
    let control = new NumericEdit(dialog);
    control.real = values.real;
    control.label.text = values.text;
    control.toolTip = values.toolTip;
    control.setRange(values.range.min, values.range.max);
    control.setPrecision(values.precision);
    return control;
}

/**
 * @param {Dialog} dialog
 * @param {String} toolTip
 * @returns {ToolButton}
 */
function createResetControl(dialog, toolTip){
    let resetButton = new ToolButton(dialog);
    resetButton.icon = dialog.scaledResource(":/icons/reload.png");
    resetButton.toolTip = toolTip;
    return resetButton;
};

/**
 * Add onMouseRelease, onKeyRelease and onLeave listeners to ensure that the 
 * supplied updateFunction is called when the NumericControl edit has finished.
 * @param {NumericControl} control
 * @param {Function({Number} controlValue)} updateFunction
 */
function addFinalUpdateListener(control, updateFunction){
    let updateNeeded = false;
    function finalUpdate(){
        updateNeeded = false;
        updateFunction();
    }
    control.slider.onMouseRelease = function (x, y, button, bState, modifiers) {
        CoreApplication.processEvents();
        finalUpdate();
    };
    control.onKeyRelease = function (keyCode, modifiers) {
        updateNeeded = true;
    };
    control.onLeave = function () {
        CoreApplication.processEvents();
        if (updateNeeded){
            finalUpdate();
        }
    };
    control.slider.onMouseWheel = function (x, y, delta, buttonState, modifiers){
        updateNeeded = true;
    };
}

function StarDetectionControls(){
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {Number} value initialise the control with this value.
     * @param {String} prefix Prefix for the control's label ('Reference' or 'Target')
     * @param {Number} strLength
     * @returns {NumericControl}
     */
    function createLogStarDetection_Control(dialog, value, prefix, strLength){
        let logStarDetection_Control = new NumericControl(dialog);
        logStarDetection_Control.real = true;
        logStarDetection_Control.label.text = prefix + " star detection:";
        if (strLength > 0){
            logStarDetection_Control.label.minWidth = strLength;
            let maxWidth = dialog.logicalPixelsToPhysical(350);
            logStarDetection_Control.maxWidth = Math.max(strLength + 100, maxWidth);
        }
        logStarDetection_Control.toolTip = "<p>Logarithm of the star detection " +
                "sensitivity. Increase this value to detect less stars.</p>";
        logStarDetection_Control.setPrecision(1);
        logStarDetection_Control.setRange(-3, 2);
        logStarDetection_Control.slider.setRange(0, 50);
        logStarDetection_Control.setValue(value);
        return logStarDetection_Control;
    }
    
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @param {Number} strLength
     * @returns {NumericControl}
     */
    this.createRefLogStarDetect_Control = function(dialog, data, strLength){
        let control = createLogStarDetection_Control(dialog, data.refLogStarDetection, "Reference", strLength);
        control.onValueUpdated = function (value) {
            data.refLogStarDetection = value;
            data.cache.setUserInputData(data.referenceView.fullId, data.targetView.fullId, 
                    data.refLogStarDetection, data.tgtLogStarDetection);
        };
        return control;
    };
    
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @param {Number} strLength
     * @returns {NumericControl}
     */
    this.createTgtLogStarDetect_Control = function(dialog, data, strLength){
        let control = createLogStarDetection_Control(dialog, data.tgtLogStarDetection, "Target", strLength);
        control.onValueUpdated = function (value) {
            data.tgtLogStarDetection = value;
            data.cache.setUserInputData(data.referenceView.fullId, data.targetView.fullId, 
                    data.refLogStarDetection, data.tgtLogStarDetection);
        };
        return control;
    };
    
    this.createStarDetectResetControl = function(dialog){
        return createResetControl(dialog, "<p>Reset star detection to default.</p>");
    };
}

function PhotometryControls(){
    let self = this;
    
    this.percentLimits = {
        real: true,
        text: "Limit stars %:",
        slider: {range: {min:0, max:500}},
        range: {min:0, max:100},
        precision: 2,
        maxWidth: 2000,
        toolTip: "<p>Specifies the percentage of detected stars used for photometry. " +
            "The faintest stars are rejected.</p>" +
            "<ul><li>100% All detected stars are used, up to a maximum of 2000.</li>" +
            "<li>90% The faintest 10% of detected stars are rejected.</li>" +
            "<li>0% No stars will be used. The scale will be calculated from the " +
                "mean and median of the overlap area.</li></ul>" +
            "<p>The default value of 100% usually works well.</p>"
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @param {Number} strLength
     * @returns {NumericControl}
     */
    this.createLimitPhotoStarsPercentControl = function(dialog, data, strLength){
        let control = createNumericControl(dialog, self.percentLimits, strLength);
        control.setValue(data.limitPhotoStarsPercent);
        return control;
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @returns {NumericEdit}
     */
    this.createLimitPhotoStarsPercentEdit = function(dialog, data){
        let control = createNumericEdit(dialog, self.percentLimits);
        control.setValue(data.limitPhotoStarsPercent);
        control.toolTip = self.percentLimits.toolTip + 
                "<p>Use the 'Photometry Graph' dialog to edit and view " +
                "the number of stars to include.</p>";
        return control;
    };
    
    this.linearRange = {
        real: true,
        text: "Linear range:",
        slider: {range: {min:0, max:1000}},
        range: {min:0.001, max:1.0},
        precision: 3,
        maxWidth: 2000,
        toolTip: "<p>Restricts the stars used for photometry to those " +
            "that have a peak pixel value less than the specified value.</p>" +
            "<p>Use this to reject stars that are outside the " +
            "camera's linear response range.</p>" +
            "<p>The default value is set to 0.7 x the highest value in the image. " +
            "If the image does not contain any saturated stars, this may be an " +
            "underestimate.</p>"
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @param {Number} strLength
     * @returns {NumericControl}
     */
    this.createLinearRangeRefControl = function(dialog, data, strLength){
        self.linearRange.text = "Reference";
        let control = createNumericControl(dialog, self.linearRange, strLength);
        control.setValue(data.linearRangeRef, self.linearRange);
        return control;
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @returns {NumericEdit}
     */
    this.createLinearRangeRefEdit = function(dialog, data){
        self.linearRange.text = "Reference";
        let control = createNumericEdit(dialog, self.linearRange);
        control.setValue(data.linearRangeRef);
        control.toolTip = self.linearRange.toolTip + 
                "<p>Use the 'Photometry Graph' dialog to edit and view the 'Linear range'.</p>";
        return control;
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @param {Number} strLength
     * @returns {NumericControl}
     */
    this.createLinearRangeTgtControl = function(dialog, data, strLength){
        self.linearRange.text = "Target";
        let control = createNumericControl(dialog, self.linearRange, strLength);
        control.setValue(data.linearRangeTgt, self.linearRange);
        return control;
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @returns {NumericEdit}
     */
    this.createLinearRangeTgtEdit = function(dialog, data){
        self.linearRange.text = "Target";
        let control = createNumericEdit(dialog, self.linearRange);
        control.setValue(data.linearRangeTgt);
        control.toolTip = self.linearRange.toolTip + 
                "<p>Use the 'Photometry Graph' dialog to edit and view the 'Linear range'.</p>";
        return control;
    };

    this.outlierRemovalPercent = {
        real: true,
        text: "Outlier removal %:",
        slider: {range: {min:0, max:400}},
        range: {min:0, max:40},
        precision: 2,
        maxWidth: 2000,
        toolTip: "<p>Percentage of outlier stars to remove.</p>" +
            "<p>Outliers can be due to variable stars, or measurement errors.</p>" +
            "<p>Removing a small percentage of outliers can improve accuracy.</p>"
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @param {Number} strLength
     * @returns {NumericControl}
     */
    this.createOutlierRemovalControl = function(dialog, data, strLength){
        let control = createNumericControl(dialog, self.outlierRemovalPercent, strLength);
        control.setValue(data.outlierRemovalPercent);
        return control;
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @returns {NumericEdit}
     */
    this.createOutlierRemovalEdit = function(dialog, data){
        let control = createNumericEdit(dialog, self.outlierRemovalPercent);
        control.setValue(data.outlierRemovalPercent);
        control.toolTip = self.outlierRemovalPercent.toolTip + 
                "<p>Use the 'Photometry Graph' dialog to edit and view the outliers.</p>";
        return control;
    };
    
    this.growthRate = {
        real: true,
        text: "Growth rate:",
        slider: {range: {min:0, max:100}},
        range: {min:0, max:1},
        precision: 2,
        maxWidth: 1000,
        toolTip: "<p>Determines the aperture size for bright stars.</p>" +
            "<p>Adjust this control until the brightest stars entirely fit " +
            "within the inner photometry aperture. " +
            "Check both reference and target stars.</p>" +
            "<p>It is not necessary to include diffraction spikes, " +
            "filter halos or scattered light.</p>"
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @param {Number} strLength
     * @returns {NumericControl}
     */
    this.createApertureGrowthRateControl = function(dialog, data, strLength){
        let control = createNumericControl(dialog, self.growthRate, strLength);
        control.setValue(data.apertureGrowthRate);
        return control;
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @returns {NumericEdit}
     */
    this.createApertureGrowthRateEdit = function(dialog, data){
        let control = createNumericEdit(dialog, self.growthRate);
        control.setValue(data.apertureGrowthRate);
        control.toolTip = self.growthRate.toolTip + 
                "<p>Use the 'Photometry Stars' dialog to edit and view the 'Growth rate'.</p>";
        return control;
    };
    
    this.apertureAdd = {
        real: false,
        text: "Radius add:",
        slider: {range: {min:0, max:10}},
        range: {min:0, max:10},
        precision: 0,
        maxWidth: 500,
        toolTip: "<p>This value is added to the aperture radius for all stars.</p>" +
            "<p>Use this control to set the photometry aperture for <b>faint stars</b> " +
            "(use 'Growth rate' for brighter stars).</p>" +
            "<p>When correctly set, each faint reference and target star should " +
            "be fully contained within the inner photometry aperture.</p>" +
            "<p>Smaller apertures will introduce less noise, but it is vital that " +
            "the whole star is within the aperture.</p>" +
            "<p>The default value of 1 usually works well.</p>"
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @param {Number} strLength
     * @returns {NumericControl}
     */
    this.createApertureAddControl = function(dialog, data, strLength){
        let control = createNumericControl(dialog, self.apertureAdd, strLength);
        control.setValue(data.apertureAdd);
        return control;
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @returns {NumericEdit}
     */
    this.createApertureAddEdit = function(dialog, data){
        let control = createNumericEdit(dialog, self.apertureAdd);
        control.setValue(data.apertureAdd);
        control.toolTip = self.apertureAdd.toolTip + 
                "<p>Use the 'Photometry Stars' dialog to edit and view the 'Radius add'.</p>";
        return control;
    };
    
    this.apertureGap = {
        real: false,
        text: "Aperture gap:",
        slider: {range: {min:0, max:50}},
        range: {min:0, max:50},
        precision: 0,
        maxWidth: 500,
        toolTip: "<p>Gap between star aperture and background aperture.</p>" +
            "<p>Use this gap to ensure the star's light does not contaminate " +
            "the background measurement.</p>"
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @param {Number} strLength
     * @returns {NumericControl}
     */
    this.createApertureGapControl = function(dialog, data, strLength){
        let control = createNumericControl(dialog, self.apertureGap, strLength);
        control.setValue(data.apertureGap);
        return control;
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @returns {NumericEdit}
     */
    this.createApertureGapEdit = function(dialog, data){
        let control = createNumericEdit(dialog, self.apertureGap);
        control.setValue(data.apertureGap);
        control.toolTip = self.apertureGap.toolTip + 
            "<p>Use the 'Photometry Stars' dialog to edit and view the 'Aperture gap'.</p>";
        return control;
    };
    
    this.apertureBgDelta = {
        real: false,
        text: "Background delta:",
        slider: {range: {min:1, max:50}},
        range: {min:1, max:50},
        precision: 0,
        maxWidth: 500,
        toolTip: "<p>Background annulus thickness.</p>" +
            "<p>This determines the square ring around the star, used to " +
            "measure the background sky flux.</p>"
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @param {Number} strLength
     * @returns {NumericControl}
     */
    this.createApertureBgDeltaControl = function(dialog, data, strLength){
        let control = createNumericControl(dialog, self.apertureBgDelta, strLength);
        control.setValue(data.apertureBgDelta);
        return control;
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @returns {NumericEdit}
     */
    this.createApertureBgDeltaEdit = function(dialog, data){
        let control = createNumericEdit(dialog, self.apertureBgDelta);
        control.setValue(data.apertureBgDelta);
        control.toolTip = self.apertureBgDelta.toolTip + 
                "<p>Use the 'Photometry Stars' dialog to edit and view the 'Background delta'.</p>";
        return control;
    };
    
}

//-------------------------------------------------------
// Sample Grid Controls
//-------------------------------------------------------
function SampleControls(){
    let self = this;
    
    this.joinSize = {
        real: true,
        text: "Size %:",
        slider: {range: {min:0, max:200}},
        range: {min:0, max:100},
        precision: 2,
        maxWidth: 1000,
        toolTip: "<p>On the reference side of the join the difference in noise " +
                "between the two images are blended together (Blend and Average modes). " +
                "This blend region extends from the join (bright green line); " +
                "a dark green line indicates where it ends.</p>" +
                "<p>This control determines how large this blend area is. For example:</p>" +
                "<ul><li><b>100%</b> The entire reference side of the join is used.</li>" +
                "<li><b>90%</b> A 10% margin is used to avoid blending pixels at the edge " +
                "of an image.</li></ul></p>"
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @param {Number} strLength
     * @returns {NumericControl}
     */
    this.createJoinSizeControl = function(dialog, data, strLength){
        let control = createNumericControl(dialog, self.joinSize, strLength);
        control.setValue(data.joinSize);
        control.toolTip = self.joinSize.toolTip;
        return control;
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @returns {NumericEdit}
     */
    this.createJoinSizeEdit = function(dialog, data){
        let control = createNumericEdit(dialog, self.joinSize);
        control.setValue(data.joinSize);
        control.toolTip = self.joinSize.toolTip + 
                "<p>Use the 'Join' button to edit and view the Join Region.</p>";
        return control;
    };
    
    this.createJoinSizeResetControl = function(dialog){
        return createResetControl(dialog, "<p>Reset join size to its default.</p>");
    };
    
    this.joinPosition = {
        real: false,
        text: "Position (+/-):",
        slider: {range: {min:0, max:800}},
        range: {min:-10000, max:10000},
        precision: 0,
        maxWidth: 1000,
        toolTip: "<p>Positions the join relative to the centre of the overlap region. " +
                "The join path is indicated by a bright green line.</p>" +
                "<p>On the reference side of this line, the difference in noise " +
                "between the two images are blended together (Blend and Average modes).</p>" +
                "<p>On the target side of the line, the detailed correction over the " +
                "overlap region is tapered to the smoother correction applied to the " +
                "rest of the target image.</p>" +
                "<p>Try to keep the join line within the sample grid area " +
                "('Show sample grid' check box) and avoid bright stars, image corners " +
                "and contrasty areas.</p>"
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @param {Number} strLength
     * @returns {NumericControl}
     */
    this.createJoinPositionControl = function(dialog, data, strLength){
        let control = createNumericControl(dialog, self.joinPosition, strLength);
        setJoinPositionRange(control, data, false);
        control.setValue(data.joinPosition);
        control.toolTip = self.joinPosition.toolTip + 
                "<p>If the mosaic combination mode is 'Blend' or 'Average', " +
                "the Blend or Average algorithm will be applied between the " +
                "join (bright green line) and the dark green line.</p>";
        return control;
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @returns {NumericEdit}
     */
    this.createJoinPositionEdit = function(dialog, data){
        let control = createNumericEdit(dialog, self.joinPosition);
        setJoinPositionRange(control, data, false);
        control.setValue(data.joinPosition);
        control.toolTip = self.joinPosition.toolTip + 
                "<p>Use the 'Join' button to edit and view the Join Path/Join Region position.</p>";
        return control;
    };
    
    this.createJoinPositionResetControl = function(dialog){
        return createResetControl(dialog, "<p>Reset join position to its default.</p>");
    };
    
    this.percentLimits = {
        real: true,
        text: "Limit stars %:",
        slider: {range: {min:0, max:500}},
        range: {min:0, max:100},
        precision: 3,
        maxWidth: 1000,
        toolTip: "<p>Specifies the percentage of the brightest detected stars that will be used to reject samples.</p>" +
            "<p>0% implies that no samples are rejected due to stars.<br />" +
            "100% implies that all detected stars are used to reject samples.</p>" +
            "<p>Samples that contain bright stars are rejected for two reasons: </p>" +
            "<ul><li>Bright pixels are more affected by any errors in the calculated scale.</li>" +
            "<li>Bright stars can have significantly different profiles between " +
            "the reference and target images. These variations are too rapid for " +
            "the surface spline to follow and can reduce the accuracy of the resulting model.</li></ul>" +
            "<p>However, it is more important to include enough samples than to reject faint stars.</p>"
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @param {Number} strLength
     * @returns {NumericControl}
     */
    this.createLimitSampleStarsPercentControl = function(dialog, data, strLength){
        let control = createNumericControl(dialog, self.percentLimits, strLength);
        control.setValue(data.limitSampleStarsPercent);
        return control;
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @returns {NumericEdit}
     */
    this.createLimitSampleStarsPercentEdit = function(dialog, data){
        let control = createNumericEdit(dialog, self.percentLimits);
        control.setValue(data.limitSampleStarsPercent);
        control.toolTip = self.percentLimits.toolTip + 
                "<p>Use the 'Sample Generation' dialog to edit and view the percentage of stars used.</p>";
        return control;
    };

    this.growthRate = {
        real: true,
        text: "Star growth rate:",
        slider: {range: {min:0, max:200}},
        range: {min:0, max:2},
        precision: 2,
        maxWidth: 1000,
        toolTip: "<p>This control is used to reject samples that contain bright stars. " +
            "The surviving samples are used to create the relative gradient model for the Overlap region.</p>" +
            "<p>Adjust this control until the rejection circles surround the stars. " +
            "It is not necessary for the rejection circles to include filter halos " +
            "or the scattered light around bright stars.</p>"
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @param {Number} strLength
     * @returns {NumericControl}
     */
    this.createSampleStarGrowthRateControl = function(dialog, data, strLength){
        let control = createNumericControl(dialog, self.growthRate, strLength);
        control.setValue(data.sampleStarGrowthRate);
        control.toolTip = self.growthRate.toolTip + 
                "<p>Unselect 'Auto' checkbox and select 'Overlap model' radio button " +
                "to edit and view the effects of this control.</p>";
        return control;
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @returns {NumericEdit}
     */
    this.createSampleStarGrowthRateEdit = function(dialog, data){
        let control = createNumericEdit(dialog, self.growthRate);
        control.setValue(data.sampleStarGrowthRate);
        control.toolTip = self.growthRate.toolTip + 
                "<p>Use the 'Sample Generation' dialog to edit and view the growth rate.</p>";
        return control;
    };
    
    this.growthRateTarget = {
        real: true,
        text: "Star growth rate:",
        slider: {range: {min:0, max:300}},
        range: {min:0, max:3},
        precision: 2,
        maxWidth: 1000,
        toolTip: "<p>This control determines which samples are used when creating the " +
            "relative gradient model for the rest of the target image.</p>" +
            "<p>The target image gradient correction needs to ignore local " +
            "gradients - e.g. due to scattered light around bright stars. " +
            "Hence the aim is to reject all samples that contain any light from bright stars. " +
            "This includes diffraction spikes, filter halos, and the star's scattered light.</p>"
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @param {Number} strLength
     * @returns {NumericControl}
     */
    this.createSampleStarGrowthRateTargetControl = function(dialog, data, strLength){
        let control = createNumericControl(dialog, self.growthRateTarget, strLength);
        control.setValue(data.sampleStarGrowthRateTarget);
        control.toolTip = self.growthRateTarget.toolTip + 
                "<p>Unselect 'Auto' checkbox and select 'Target model' radio button " +
                "to edit and view the effects of this control.</p>";
        return control;
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @returns {NumericEdit}
     */
    this.createSampleStarGrowthRateTargetEdit = function(dialog, data){
        let control = createNumericEdit(dialog, self.growthRateTarget);
        control.setValue(data.sampleStarGrowthRateTarget);
        control.toolTip = self.growthRateTarget.toolTip + 
                "<p>Use the 'Sample Generation' dialog to edit and view the effects of the growth rate.</p>";
        return control;
    };
    
    this.sampleSize = {
        real: false,
        text: "Sample size:",
        slider: {range: {min:2, max:150}},
        range: {min:2, max:150},
        precision: 0,
        maxWidth: 500,
        toolTip: "<p>Specifies the size of the sample squares.</p>" +
            "<p>The sample size should be at least 2x the size of the largest " +
            "star that's not rejected by 'Limit stars %'.</p>" +
            "<p>The sample's value is the median of its pixels. " +
            "They are used to create a surface spline that models the relative gradient.</p>" +
            "<p>Samples are rejected if they contain one or more black pixels, " +
            "or if they are within a star's rejection radius.</p>"
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @param {Number} maxSampleSize Sample size is limited by join area thickness
     * @param {Number} strLength
     * @returns {NumericControl}
     */
    this.createSampleSizeControl = function(dialog, data, maxSampleSize, strLength){
        let control = createNumericControl(dialog, self.sampleSize, strLength);
        if (maxSampleSize < self.sampleSize.range.max){
            control.setRange(self.sampleSize.range.min, maxSampleSize);
        }
        control.setValue(data.sampleSize);
        control.toolTip = self.sampleSize.toolTip + 
                "<p>Unselect the 'Auto' checkbox " +
                "to edit and view the effects of this control.</p>";
        return control;
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @param {Number} maxSampleSize Sample size is limited by join area thickness
     * @returns {NumericEdit}
     */
    this.createSampleSizeEdit = function(dialog, data, maxSampleSize){
        let control = createNumericEdit(dialog, self.sampleSize);
        if (maxSampleSize < self.sampleSize.range.max){
            control.setRange(self.sampleSize.range.min, maxSampleSize);
        }
        control.setValue(data.sampleSize);
        control.toolTip = self.sampleSize.toolTip + 
                "<p>Use the 'Sample Generation' dialog to edit and view the effects of the sample size.</p>";
        return control;
    };
}

let adjustScaleHelpText = "<p>If the gradient has peaks or troughs that follow the intensity " +
        "variations over nebulae or galaxies (ignore any due to stars), this may indicate a scale error.</p>" +
        "<ul><li>Check <b>Gradient Path</b> to display the overlap image. " +
        "Adjust <b>Position(+/-)</b> so that the gradient path (green line) traverses bright and dark areas.<\li>" +
        "<li>Check <b>Adjust Scale</b> to display the graph. Adjust the scale until " +
        "any peak or trough that corresponds to a bright area " +
        "disappears into the gradient trend.<\li></ul>";

//-------------------------------------------------------
// Adjust Scale Controls
//-------------------------------------------------------
function AdjustScaleControls(){
    let self = this;
    
    this.adjustRedScale = {
        real: true,
        text: "L/Red:",
        slider: {range: {min:0, max:4400}},
        range: {min:0.6, max:1.6},
        precision: 4,
        maxWidth: 2000,
        toolTip: "<p>Multiply the calculated scale by this correction factor.</p>"
    };
    
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @param {Number} strLength
     * @returns {NumericControl}
     */
    this.createAdjustRedControl = function(dialog, data, strLength){
        let control = createNumericControl(dialog, self.adjustRedScale, strLength);
        control.toolTip = self.adjustRedScale.toolTip + adjustScaleHelpText;
        control.setValue(data.adjustScale[0]);
        return control;
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @returns {NumericEdit}
     */
    this.createAdjustRedEdit = function(dialog, data){
        let control = createNumericEdit(dialog, self.adjustRedScale);
        control.setValue(data.adjustScale[0]);
        return control;
    };
    
    this.createScaleResetControl = function(dialog){
        return createResetControl(dialog, "<p>Reset scale adjustment to 1.0</p>");
    };
    
    this.adjustGreenScale = {
        real: true,
        text: "Green:",
        slider: {range: {min:0, max:4400}},
        range: {min:0.6, max:1.6},
        precision: 4,
        maxWidth: 2000,
        toolTip: "<p>Multiply the calculated scale by this correction factor.</p>"
    };
    
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @param {Number} strLength
     * @returns {NumericControl}
     */
    this.createAdjustGreenControl = function(dialog, data, strLength){
        let control = createNumericControl(dialog, self.adjustGreenScale, strLength);
        control.toolTip = self.adjustGreenScale.toolTip + adjustScaleHelpText;
        control.setValue(data.adjustScale[1]);
        return control;
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @returns {NumericEdit}
     */
    this.createAdjustGreenEdit = function(dialog, data){
        let control = createNumericEdit(dialog, self.adjustGreenScale);
        control.setValue(data.adjustScale[1]);
        return control;
    };
    
    this.adjustBlueScale = {
        real: true,
        text: "Blue:",
        slider: {range: {min:0, max:4400}},
        range: {min:0.6, max:1.6},
        precision: 4,
        maxWidth: 2000,
        toolTip: "<p>Multiply the calculated scale by this correction factor.</p>"
    };
    
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @param {Number} strLength
     * @returns {NumericControl}
     */
    this.createAdjustBlueControl = function(dialog, data, strLength){
        let control = createNumericControl(dialog, self.adjustBlueScale, strLength);
        control.toolTip = self.adjustBlueScale.toolTip + adjustScaleHelpText;
        control.setValue(data.adjustScale[2]);
        return control;
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @returns {NumericEdit}
     */
    this.createAdjustBlueEdit = function(dialog, data){
        let control = createNumericEdit(dialog, self.adjustBlueScale);
        control.setValue(data.adjustScale[2]);
        return control;
    };
}

//-------------------------------------------------------
// Gradient Path Controls
//-------------------------------------------------------
function GradientPathControls(){
    let self = this;
    
    this.GradientLine = {
        real: true,
        text: "Position (+/-):",
        slider: {range: {min:0, max:800}},
        range: {min:-10000, max:10000},
        precision: 0,
        maxWidth: 2000,
        toolTip: adjustScaleHelpText
    };
    
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @param {Number} strLength
     * @returns {NumericControl}
     */
    this.createGradientLineControl = function(dialog, data, strLength){
        let control = createNumericControl(dialog, self.GradientLine, strLength);
        setGradientLineRange(control, data);
        control.setValue(data.adjustScaleLineOffset);
        return control;
    };
    
    function setGradientLineRange(control, data){
        let overlapBox = data.cache.overlap.overlapBox;
        let isHorizontal = data.cache.overlap.isHorizontalJoin();
        let totalRange = isHorizontal ? overlapBox.height : overlapBox.width;
        let mid = Math.floor(totalRange / 2.0);
        let min = -mid;
        let max = totalRange - mid;
        control.slider.setRange(0, totalRange);
        control.setRange(min, max);
    }
}

//-------------------------------------------------------
// Gradient Controls
//-------------------------------------------------------
function GradientControls(){
    let self = this;
    
    this.overlapGradientSmoothness = {
        real: true,
        text: "Gradient smoothness:",
        slider: {range: {min:0, max:700}},
        range: {min:-5, max:2},
        precision: 1,
        maxWidth: 1000,
        toolTip: "<p>A surface spline is created to model the relative " +
        "gradient over the whole of the overlap region. Smoothing needs to be applied " +
        "to this surface spline to ensure it follows the gradient but not the noise.</p>" +
        "<p>If the gradient graph contains a large peak or trough, read the help section: " +
        "<i>Tutorial: Sample rejection and gradient graphs</i>.</p>" +
        "<p>This control specifies the logarithm of the smoothness. " +
        "Larger values apply more smoothing.</p>"
    };
    
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @param {Number} strLength
     * @returns {NumericControl}
     */
    this.createOverlapGradientSmoothnessControl = function(dialog, data, strLength){
        let control = createNumericControl(dialog, self.overlapGradientSmoothness, strLength);
        control.setValue(data.overlapGradientSmoothness);
        return control;
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @returns {NumericEdit}
     */
    this.createOverlapGradientSmoothnessEdit = function(dialog, data){
        let control = createNumericEdit(dialog, self.overlapGradientSmoothness);
        control.setValue(data.overlapGradientSmoothness);
        return control;
    };
    
    this.createSmoothnessResetControl = function(dialog){
        return createResetControl(dialog, "<p>Reset gradient smoothness to its default.</p>");
    };

    this.targetGradientSmoothness = {
        real: true,
        text: "Gradient smoothness:",
        slider: {range: {min:0, max:400}},
        range: {min:0, max:4},
        precision: 1,
        maxWidth: 1000,
        toolTip: "<p>A surface spline is created to model the gradient correction that " +
            "will be applied to the rest of the target image. This correction should " +
            "consist of a smooth curve that ignores all local gradients " +
            "(diffuse light around bright stars, filter halos, diffraction spikes) " +
            "and only follows the gradient trend.</p>" +
            "<p>Apply sufficient smoothing to produce a smooth gentle curve. " +
            "If the data contains significant peaks or troughs, " +
            "read the help section: <i>Tutorial: Sample rejection and gradient graphs</i>.</p>" +
            "<p>This control specifies the logarithm of the smoothness. " +
            "Larger values apply more smoothing.</p>"
    };
    
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @param {Number} strLength
     * @returns {NumericControl}
     */
    this.createTargetGradientSmoothnessControl = function(dialog, data, strLength){
        let control = createNumericControl(dialog, self.targetGradientSmoothness, strLength);
        control.setValue(data.targetGradientSmoothness);
        return control;
    };
    /**
     * @param {PhotometricMosaicDialog} dialog
     * @param {PhotometricMosaicData} data
     * @returns {NumericEdit}
     */
    this.createTargetGradientSmoothnessEdit = function(dialog, data){
        let control = createNumericEdit(dialog, self.targetGradientSmoothness);
        control.setValue(data.targetGradientSmoothness);
        return control;
    };
}

/**
 * Sets the JoinPosition control min, max range.
 * @param {Control} control Update this controls min, max range
 * @param {PhotometricMosaicData} data
 * @param {Boolean} updateData If true, update data.joinPosition to be within range.
 * This should be set to true if the range changes because the overlap has just been calculated
 * We then need to make sure that the data.joinPosition is within the allowed range.
 */
function setJoinPositionRange(control, data, updateData){
    if (data.cache.overlap !== null){
        let joinRegion = new JoinRegion(data);
        let range = joinRegion.getJoinPositionRange();
        if (control instanceof NumericControl){
            control.slider.setRange(0, range.max - range.min);
        }
        control.setRange(range.min, range.max);
        if (updateData){
            data.joinPosition = control.value;
        }
    } else {
        // We don't know what the real range is, so just make sure the range is 
        // big enough to accept the data.joinPosition value.
        control.setRange(
                Math.min(control.lowerBound, data.joinPosition), 
                Math.max(control.upperBound, data.joinPosition));
    }
}
