/* global Parameters, View, APERTURE_GROWTH, APERTURE_ADD, APERTURE_GAP, APERTURE_BKG_DELTA, APERTURE_GROWTH_OVERLAP, APERTURE_GROWTH_TARGET, DataType.UCString, Settings, KEYPREFIX, DataType.Float, DataType.Int32, DataType.Boolean, PIXEL_SIZE_DEFAULT, FOCAL_LENGTH_DEFAULT, DEFAULT_STAR_DETECTION, DEFAULT_STAR_FLUX_TOLERANCE, DEFAULT_STAR_SEARCH_RADIUS, DEFAULT_OUTLIER_PERCENT, DEFAULT_OVERLAP_GRADIENT_SMOOTHNESS, DEFAULT_TARGET_GRADIENT_SMOOTHNESS, DEFAULT_JOIN_SIZE */


//"use strict";

// -----------------------------------------------------------------------------
// Form/Dialog data
// -----------------------------------------------------------------------------
function PhotometricMosaicData() {
    // Used to populate the contents of a saved process icon
    // Also used at the end of our script to populate the history entry.
    this.saveParameters = function () {
        Parameters.clear();
        if (this.referenceView.isMainView) {
            Parameters.set("referenceView", this.referenceView.fullId);
        }
        if (this.targetView.isMainView) {
            Parameters.set("targetView", this.targetView.fullId);
        }
        Parameters.set("replaceRefImage", this.replaceRefImage);
        Parameters.set("pixelSize", this.pixelSize);
        Parameters.set("focalLength", this.focalLength);
        
        // Star Detection
        Parameters.set("refLogStarDetection", this.refLogStarDetection);
        Parameters.set("tgtLogStarDetection", this.tgtLogStarDetection);
        
        // Photometric Star Search
        Parameters.set("starFluxTolerance", this.starFluxTolerance);
        Parameters.set("starSearchRadius", this.starSearchRadius);
        
        // Photometric Scale
        Parameters.set("apertureGrowthRate", this.apertureGrowthRate);
        Parameters.set("apertureAdd", this.apertureAdd);
        Parameters.set("apertureGap", this.apertureGap);
        Parameters.set("apertureBgDelta", this.apertureBgDelta);
        Parameters.set("limitPhotoStarsPercent", this.limitPhotoStarsPercent);
        Parameters.set("linearRangeRef", this.linearRangeRef);
        Parameters.set("linearRangeTgt", this.linearRangeTgt);
        Parameters.set("outlierRemovalPercent", this.outlierRemovalPercent);
        Parameters.set("useAutoPhotometry", this.useAutoPhotometry);
        
        // Join Region
        Parameters.set("joinSize", this.joinSize);
        Parameters.set("joinPosition", this.joinPosition);
        Parameters.set("joinOutlierPercent", this.joinOutlierPercent);
        
        // Replace/Update Region
        Parameters.set("cropTargetPreviewLeft", this.cropTargetPreviewRect.x0);
        Parameters.set("cropTargetPreviewTop", this.cropTargetPreviewRect.y0);
        Parameters.set("cropTargetPreviewWidth", this.cropTargetPreviewRect.width);
        Parameters.set("cropTargetPreviewHeight", this.cropTargetPreviewRect.height);
        Parameters.set("useCropTargetToReplaceRegion", this.useCropTargetToReplaceRegion);
        
        // Gradient Sample Generation
        Parameters.set("sampleStarGrowthRate", this.sampleStarGrowthRate);
        Parameters.set("sampleStarGrowthRateTarget", this.sampleStarGrowthRateTarget);
        Parameters.set("limitSampleStarsPercent", this.limitSampleStarsPercent);
        Parameters.set("sampleSize", this.sampleSize);
        Parameters.set("maxSamples", this.maxSamples);
        Parameters.set("useAutoSampleGeneration", this.useAutoSampleGeneration);
        for (let i=0; i<this.manualRejectionCircles.length; i++){
            let mrc = this.manualRejectionCircles[i];
            Parameters.set("manualRejectionCircle" + i + "_x", mrc.x);
            Parameters.set("manualRejectionCircle" + i + "_y", mrc.y);
            Parameters.set("manualRejectionCircle" + i + "_overlapRadius", mrc.overlapRadius);
            Parameters.set("manualRejectionCircle" + i + "_targetRadius", mrc.targetRadius);
        }
        
        // Adjust Scale
        Parameters.set("adjustScale0", this.adjustScale[0]);
        Parameters.set("adjustScale1", this.adjustScale[1]);
        Parameters.set("adjustScale2", this.adjustScale[2]);
        Parameters.set("adjustScaleLineOffset", this.adjustScaleLineOffset);
        
        // Gradient Correction (Overlap region)
        Parameters.set("overlapGradientSmoothness", this.overlapGradientSmoothness);
        Parameters.set("taperLength", this.taperLength);
        Parameters.set("useAutoTaperLength", this.useAutoTaperLength);
        
        // Gradient Correction (Target image)
        Parameters.set("useTargetGradientCorrection", this.useTargetGradientCorrection);
        Parameters.set("targetGradientSmoothness", this.targetGradientSmoothness);
        
        // Mosaic Star Mask
        Parameters.set("limitMaskStarsPercent", this.limitMaskStarsPercent);
        Parameters.set("maskStarGrowthRate", this.maskStarGrowthRate);
        Parameters.set("maskStarGrowthLimit", this.maskStarGrowthLimit);
        Parameters.set("maskStarRadiusAdd", this.maskStarRadiusAdd);
        Parameters.set("useAutoMaskStarSize", this.useAutoMaskStarSize);
        
        // Mosaic Join Mode
        Parameters.set("useMosaicOverlay", this.useMosaicOverlay);
        Parameters.set("useMosaicRandom", this.useMosaicRandom);
        Parameters.set("useMosaicAverage", this.useMosaicAverage);
        Parameters.set("useJoinOrientationAuto", this.useJoinOrientationAuto);
        Parameters.set("useJoinOrientationHorizontal", this.useJoinOrientationHorizontal);
        Parameters.set("useJoinOrientationVertical", this.useJoinOrientationVertical);
        Parameters.set("createJoinMask", this.createJoinMask);
        
        Parameters.set("smallScreen", this.smallScreen);
        Parameters.set("graphWidth", this.graphWidth);
        Parameters.set("graphHeight", this.graphHeight);
        Parameters.set("extraControls", EXTRA_CONTROLS);
    };

    // Reload our script's data from a process icon
    this.loadParameters = function () {
        if (Parameters.has("referenceView")) {
            let viewId = Parameters.getString("referenceView");
            this.referenceView = viewByIdSafe(viewId);
        }
        if (Parameters.has("targetView")) {
            let viewId = Parameters.getString("targetView");
            this.targetView = viewByIdSafe(viewId);
        }
        if (Parameters.has("replaceRefImage"))
            this.replaceRefImage = Parameters.getBoolean("replaceRefImage");
        
        this.hasPixelScale = true;
        if (Parameters.has("pixelSize")) {
            this.pixelSize = Parameters.getReal("pixelSize");
        } else {
            this.hasPixelScale = false;
        }
        if (Parameters.has("focalLength")) {
            this.focalLength = Math.round(Parameters.getReal("focalLength"));
        } else {
            this.hasPixelScale = false;
        }
        
        // Star Detection
        if (Parameters.has("refLogStarDetection"))
            this.refLogStarDetection = Parameters.getReal("refLogStarDetection");
        if (Parameters.has("tgtLogStarDetection"))
            this.tgtLogStarDetection = Parameters.getReal("tgtLogStarDetection");
        
        // Photometric Star Search
        if (Parameters.has("starFluxTolerance"))
            this.starFluxTolerance = Parameters.getReal("starFluxTolerance");
        if (Parameters.has("starSearchRadius"))
            this.starSearchRadius = Parameters.getReal("starSearchRadius");
        
        // Photometric Scale
        if (Parameters.has("apertureGrowthRate"))
            this.apertureGrowthRate = Parameters.getReal("apertureGrowthRate");
        if (Parameters.has("apertureAdd"))
            this.apertureAdd = Parameters.getInteger("apertureAdd");
        if (Parameters.has("apertureGap"))
            this.apertureGap = Parameters.getInteger("apertureGap");
        if (Parameters.has("apertureBgDelta"))
            this.apertureBgDelta = Parameters.getInteger("apertureBgDelta");
        if (Parameters.has("limitPhotoStarsPercent"))
            this.limitPhotoStarsPercent = Parameters.getReal("limitPhotoStarsPercent");
        if (Parameters.has("linearRangeRef"))
            this.linearRangeRef = Parameters.getReal("linearRangeRef");
        if (Parameters.has("linearRangeTgt"))
            this.linearRangeTgt = Parameters.getReal("linearRangeTgt");
        if (Parameters.has("outlierRemovalPercent"))
            this.outlierRemovalPercent = Parameters.getReal("outlierRemovalPercent");
        if (Parameters.has("useAutoPhotometry"))
            this.useAutoPhotometry = Parameters.getBoolean("useAutoPhotometry");
        
        // Join Region
        if (Parameters.has("joinSize"))
            this.joinSize = Parameters.getReal("joinSize");
        if (Parameters.has("joinPosition"))
            this.joinPosition = Parameters.getInteger("joinPosition");
        if (Parameters.has("joinOutlierPercent"))
            this.joinOutlierPercent = Parameters.getReal("joinOutlierPercent");
        
        // Replace/Update Region
        {
            let x = 0;
            let y = 0;
            let w = 1;
            let h = 1;
            if (Parameters.has("cropTargetPreviewLeft")){
                x = Parameters.getInteger("cropTargetPreviewLeft");
            }
            if (Parameters.has("cropTargetPreviewTop")){
                y = Parameters.getInteger("cropTargetPreviewTop");
            }
            if (Parameters.has("cropTargetPreviewWidth")){
                w = Parameters.getInteger("cropTargetPreviewWidth");
            }
            if (Parameters.has("cropTargetPreviewHeight")){
                h = Parameters.getInteger("cropTargetPreviewHeight");
            }
            this.cropTargetPreviewRect = new Rect(x, y, x + w, y + h);
            
            if (Parameters.has("useCropTargetToReplaceRegion"))
                this.useCropTargetToReplaceRegion = Parameters.getBoolean("useCropTargetToReplaceRegion");
        }
        
        // Gradient Sample Generation
        if (Parameters.has("sampleStarGrowthRate"))
            this.sampleStarGrowthRate = Parameters.getReal("sampleStarGrowthRate");
        if (Parameters.has("sampleStarGrowthRateTarget"))
            this.sampleStarGrowthRateTarget = Parameters.getReal("sampleStarGrowthRateTarget");
        if (Parameters.has("limitSampleStarsPercent"))
            this.limitSampleStarsPercent = Parameters.getReal("limitSampleStarsPercent");
        if (Parameters.has("sampleSize"))
            this.sampleSize = Parameters.getInteger("sampleSize");
        if (Parameters.has("maxSamples"))
            this.maxSamples = Parameters.getInteger("maxSamples");
        if (Parameters.has("useAutoSampleGeneration"))
            this.useAutoSampleGeneration = Parameters.getBoolean("useAutoSampleGeneration");
        for (let i=0; ; i++){
            if (Parameters.has("manualRejectionCircle" + i + "_x") &&
                    Parameters.has("manualRejectionCircle" + i + "_y") &&
                    Parameters.has("manualRejectionCircle" + i + "_overlapRadius") &&
                    Parameters.has("manualRejectionCircle" + i + "_targetRadius")){
                
                let x = Parameters.getReal("manualRejectionCircle" + i + "_x");
                let y = Parameters.getReal("manualRejectionCircle" + i + "_y");
                let overlapR = Parameters.getInteger("manualRejectionCircle" + i + "_overlapRadius");
                let targetR = Parameters.getInteger("manualRejectionCircle" + i + "_targetRadius");
                this.manualRejectionCircles.push(new ManualRejectionCircle(x, y, overlapR, targetR));
            } else {
                break;
            }
        }
        
        // Adjust Scale
        if (Parameters.has("adjustScale0"))
            this.adjustScale[0] = Parameters.getReal("adjustScale0");
        if (Parameters.has("adjustScale1"))
            this.adjustScale[1] = Parameters.getReal("adjustScale1");
        if (Parameters.has("adjustScale2"))
            this.adjustScale[2] = Parameters.getReal("adjustScale2");
        if (Parameters.has("adjustScaleLineOffset"))
            this.adjustScaleLineOffset = Parameters.getInteger("adjustScaleLineOffset");
        
        // Gradient Correction (Overlap region)
        if (Parameters.has("overlapGradientSmoothness"))
            this.overlapGradientSmoothness = Parameters.getReal("overlapGradientSmoothness");
        if (Parameters.has("taperLength"))
            this.taperLength = Parameters.getInteger("taperLength");
        if (Parameters.has("useAutoTaperLength"))
            this.useAutoTaperLength = Parameters.getBoolean("useAutoTaperLength");
        
        // Gradient Correction (Target image)
        if (Parameters.has("useTargetGradientCorrection"))
            this.useTargetGradientCorrection = Parameters.getBoolean("useTargetGradientCorrection");
        if (Parameters.has("targetGradientSmoothness"))
            this.targetGradientSmoothness = Parameters.getReal("targetGradientSmoothness");
        
        // Mosaic Star Mask
        if (Parameters.has("limitMaskStarsPercent"))
            this.limitMaskStarsPercent = Parameters.getReal("limitMaskStarsPercent");
        if (Parameters.has("maskStarGrowthRate"))
            this.maskStarGrowthRate = Parameters.getReal("maskStarGrowthRate");
        if (Parameters.has("maskStarGrowthLimit"))
            this.maskStarGrowthLimit = Parameters.getInteger("maskStarGrowthLimit");
        if (Parameters.has("maskStarRadiusAdd"))
            this.maskStarRadiusAdd = Parameters.getReal("maskStarRadiusAdd");
        if (Parameters.has("useAutoMaskStarSize"))
            this.useAutoMaskStarSize = Parameters.getBoolean("useAutoMaskStarSize");
        
        // Mosaic Join Mode
        if (Parameters.has("useMosaicOverlay"))
            this.useMosaicOverlay = Parameters.getBoolean("useMosaicOverlay");
        if (Parameters.has("useMosaicRandom"))
            this.useMosaicRandom = Parameters.getBoolean("useMosaicRandom");
        if (Parameters.has("useMosaicAverage"))
            this.useMosaicAverage = Parameters.getBoolean("useMosaicAverage");
        if (Parameters.has("useJoinOrientationAuto"))
            this.useJoinOrientationAuto = Parameters.getBoolean("useJoinOrientationAuto");
        if (Parameters.has("useJoinOrientationHorizontal"))
            this.useJoinOrientationHorizontal = Parameters.getBoolean("useJoinOrientationHorizontal");
        if (Parameters.has("useJoinOrientationVertical"))
            this.useJoinOrientationVertical = Parameters.getBoolean("useJoinOrientationVertical");
        if (Parameters.has("createJoinMask"))
            this.createJoinMask = Parameters.getBoolean("createJoinMask");
        
        if (Parameters.has("smallScreen"))
            this.smallScreen = Parameters.getBoolean("smallScreen");
        if (Parameters.has("graphWidth"))
            this.graphWidth = Parameters.getInteger("graphWidth");
        if (Parameters.has("graphHeight"))
            this.graphHeight = Parameters.getInteger("graphHeight");
        
        if (Parameters.has("extraControls")){
            EXTRA_CONTROLS = Parameters.getBoolean("extraControls");
        }

    };

    // Initialise the scripts data
    this.setParameters = function () {
        this.pixelSize = PIXEL_SIZE_DEFAULT;
        this.focalLength = FOCAL_LENGTH_DEFAULT;
        this.hasPixelScale = false;
        
        this.referenceView = new View();
        this.targetView = new View();
        this.replaceRefImage = false;
        
        // Star Detection
        this.refLogStarDetection = DEFAULT_STAR_DETECTION;
        this.tgtLogStarDetection = DEFAULT_STAR_DETECTION;
        
        // Photometric Star Search
        this.starFluxTolerance = DEFAULT_STAR_FLUX_TOLERANCE;
        this.starSearchRadius = DEFAULT_STAR_SEARCH_RADIUS;
        
        // Photometric Scale
        this.apertureGrowthRate = APERTURE_GROWTH;
        this.apertureAdd = APERTURE_ADD;
        this.apertureGap = APERTURE_GAP;
        this.apertureBgDelta = APERTURE_BKG_DELTA;
        this.limitPhotoStarsPercent = 100;
        this.outlierRemovalPercent = DEFAULT_OUTLIER_PERCENT;
        this.useAutoPhotometry = true;
        this.adjustScale = [];
        this.adjustScale[0] = 1;
        this.adjustScale[1] = 1;
        this.adjustScale[2] = 1;
        this.adjustScaleLineOffset = 0;
        
        // Join Region
        this.joinSize = DEFAULT_JOIN_SIZE;
        this.joinPosition = 0;
        this.joinOutlierPercent = 2.0;
        
        // Replace/Update Region
        this.cropTargetPreviewRect = new Rect(0, 0, 0, 0);
        this.useCropTargetToReplaceRegion = false;
        
        // Gradient Sample Generation
        this.sampleStarGrowthRate = APERTURE_GROWTH_OVERLAP;
        this.sampleStarGrowthRateTarget = APERTURE_GROWTH_TARGET;
        this.limitSampleStarsPercent = 35;
        this.sampleSize = 20;
        this.maxSamples = 3000;
        this.useAutoSampleGeneration = true;
        this.manualRejectionCircles = [];
        
        // Gradient Correction (Overlap region)
        this.overlapGradientSmoothness = DEFAULT_OVERLAP_GRADIENT_SMOOTHNESS;
        this.taperLength = 200;
        this.useAutoTaperLength = true;
        
        // Gradient Correction (Target image)
        this.useTargetGradientCorrection = true;
        this.targetGradientSmoothness = DEFAULT_TARGET_GRADIENT_SMOOTHNESS;
        
        // Mosaic Star Mask
        this.limitMaskStarsPercent = 10;
        this.maskStarGrowthRate = APERTURE_GROWTH;
        this.maskStarGrowthLimit = 400;
        this.maskStarRadiusAdd = APERTURE_ADD + 3;
        this.useAutoMaskStarSize = true;
        
        // Mosaic Join Mode
        this.useMosaicOverlay = true;
        this.useMosaicRandom = false;
        this.useMosaicAverage = false;
        this.useJoinOrientationAuto = true;
        this.useJoinOrientationHorizontal = false;
        this.useJoinOrientationVertical = false;
        this.createJoinMask = true;
        
        this.graphWidth = 1200; // gradient and photometry graph width
        this.graphHeight = 800; // gradient and photometry graph height
        
        this.smallScreen = false;
        
        if (this.cache !== undefined){
            this.cache.invalidate();
        }
        this.cache = new MosaicCache();
        this.cache.setUserInputData(this.referenceView.fullId, this.targetView.fullId, 
                this.refLogStarDetection, this.tgtLogStarDetection);
        this.linearRangeRef = this.cache.getLinearRangeRef();
        this.linearRangeTgt = this.cache.getLinearRangeTgt();
    };

    // Used when the user presses the reset button
    this.resetParameters = function (photometricMosaicDialog) {
        // Reset the script's data
        this.setParameters();
        photometricMosaicDialog.referenceImage_ViewList.currentView = this.referenceView;
        photometricMosaicDialog.targetImage_ViewList.currentView = this.targetView;
        photometricMosaicDialog.setPixelScaleFields();
        photometricMosaicDialog.replaceRefCheckBox.checked = this.replaceRefImage;
        
        // Star Detection
        photometricMosaicDialog.refLogStarDetection_Control.setValue(this.refLogStarDetection);
        photometricMosaicDialog.tgtLogStarDetection_Control.setValue(this.tgtLogStarDetection);
        
        // Photometric Star Search
        photometricMosaicDialog.starFluxTolerance_Control.setValue(this.starFluxTolerance);
        photometricMosaicDialog.starSearchRadius_Control.setValue(this.starSearchRadius);
        
        // Photometric Scale
        photometricMosaicDialog.apertureGrowthRate_Control.setValue(this.apertureGrowthRate);
        photometricMosaicDialog.apertureAdd_Control.setValue(this.apertureAdd);
        photometricMosaicDialog.apertureGap_Control.setValue(this.apertureGap);
        photometricMosaicDialog.apertureBgDelta_Control.setValue(this.apertureBgDelta);
        photometricMosaicDialog.limitPhotoStarsPercent_Control.setValue(this.limitPhotoStarsPercent);
        photometricMosaicDialog.linearRangeRef_Control.setValue(this.linearRangeRef);
        photometricMosaicDialog.linearRangeTgt_Control.setValue(this.linearRangeTgt);
        photometricMosaicDialog.outlierRemoval_Control.setValue(this.outlierRemovalPercent);
        photometricMosaicDialog.setPhotometryAutoValues(this.useAutoPhotometry);
        
        // Mosaic Join Mode
        photometricMosaicDialog.mosaicOverlay_Control.checked = this.useMosaicOverlay;
        photometricMosaicDialog.mosaicRandom_Control.checked = this.useMosaicRandom;
        photometricMosaicDialog.mosaicAverage_Control.checked = this.useMosaicAverage;
        photometricMosaicDialog.joinOrientationAuto_Control.checked = this.useJoinOrientationAuto;
        photometricMosaicDialog.joinOrientationHorizontal_Control.checked = this.useJoinOrientationHorizontal;
        photometricMosaicDialog.joinOrientationVertical_Control.checked = this.useJoinOrientationVertical;
        photometricMosaicDialog.joinOutlier_Control.setValue(this.joinOutlierPercent);
        photometricMosaicDialog.joinMask_CheckBox.checked = this.createJoinMask;
        
        // Join Region
        photometricMosaicDialog.joinSize_Control.setValue(this.joinSize);
        photometricMosaicDialog.joinPosition_Control.setValue(this.joinPosition);
        
        // Replace/Update Region
        photometricMosaicDialog.rectangleX0_Control.setValue(this.cropTargetPreviewRect.x0);
        photometricMosaicDialog.rectangleY0_Control.setValue(this.cropTargetPreviewRect.y0);
        photometricMosaicDialog.rectangleWidth_Control.setValue(this.cropTargetPreviewRect.width);
        photometricMosaicDialog.rectangleHeight_Control.setValue(this.cropTargetPreviewRect.height);
        photometricMosaicDialog.previewImage_ViewList.currentView = new View();
        photometricMosaicDialog.enableReplaceUpdateRegion(this.useCropTargetToReplaceRegion);
        
        // Gradient Sample Generation
        photometricMosaicDialog.sampleStarGrowthRate_Control.setValue(this.sampleStarGrowthRate);
        photometricMosaicDialog.sampleStarGrowthRateTarget_Control.setValue(this.sampleStarGrowthRateTarget);
        photometricMosaicDialog.limitSampleStarsPercent_Control.setValue(this.limitSampleStarsPercent);
        photometricMosaicDialog.sampleSize_Control.setValue(this.sampleSize);
        if (EXTRA_CONTROLS){
            photometricMosaicDialog.maxSamples_Control.setValue(this.maxSamples);
        }
        photometricMosaicDialog.setSampleGenerationAutoValues(this.useAutoSampleGeneration);
        
        // Adjust Scale
        photometricMosaicDialog.resetAdjustScaleControls();
        
        // Gradient Correction (Overlap region)
        photometricMosaicDialog.overlapGradientSmoothness_Control.setValue(this.overlapGradientSmoothness);
        photometricMosaicDialog.taperLength_Control.setValue(this.taperLength);
        photometricMosaicDialog.autoTaperLengthCheckBox.checked = this.useAutoTaperLength;
        photometricMosaicDialog.setTaperLengthAutoValue(this);
        
        // Gradient Correction (Target image)
        photometricMosaicDialog.targetGradientSmoothness_Control.setValue(this.targetGradientSmoothness);
        photometricMosaicDialog.setTargetGradientFlag(this.useTargetGradientCorrection);
        
        photometricMosaicDialog.smallScreenToggle.checked = this.smallScreen;
    };
    
    // Initialise the script's data
    this.setParameters();
}

/**
 * Save all script parameters as settings keys.
 * @param {PhotometricMosaicData} data 
 */
function saveSettings(data){
    resetSettings();
    if (data.referenceView.isMainView) {
        Settings.write( KEYPREFIX+"/referenceView", DataType.UCString, data.referenceView.fullId);
    }
    if (data.targetView.isMainView) {
        Settings.write( KEYPREFIX+"/targetView", DataType.UCString, data.targetView.fullId);
    }
    
    Settings.write( KEYPREFIX+"/replaceRefImage", DataType.Boolean, data.replaceRefImage );
    Settings.write( KEYPREFIX+"/pixelSize", DataType.Float, data.pixelSize );
    Settings.write( KEYPREFIX+"/focalLength", DataType.Int32, data.focalLength );
    
    // Star Detection
    Settings.write( KEYPREFIX+"/refLogStarDetection", DataType.Float, data.refLogStarDetection );
    Settings.write( KEYPREFIX+"/tgtLogStarDetection", DataType.Float, data.tgtLogStarDetection );
    
        // Photometric Star Search
    Settings.write( KEYPREFIX+"/starFluxTolerance", DataType.Float, data.starFluxTolerance );
    Settings.write( KEYPREFIX+"/starSearchRadius", DataType.Float, data.starSearchRadius );

    // Photometric Scale
    Settings.write( KEYPREFIX+"/apertureGrowthRate", DataType.Float, data.apertureGrowthRate );
    Settings.write( KEYPREFIX+"/apertureAdd", DataType.Int32, data.apertureAdd );
    Settings.write( KEYPREFIX+"/apertureGap", DataType.Int32, data.apertureGap );
    Settings.write( KEYPREFIX+"/apertureBgDelta", DataType.Int32, data.apertureBgDelta );
    Settings.write( KEYPREFIX+"/limitPhotoStarsPercent", DataType.Float, data.limitPhotoStarsPercent );
    Settings.write( KEYPREFIX+"/linearRangeRef", DataType.Float, data.linearRangeRef );
    Settings.write( KEYPREFIX+"/linearRangeTgt", DataType.Float, data.linearRangeTgt );
    Settings.write( KEYPREFIX+"/outlierRemovalPercent", DataType.Float, data.outlierRemovalPercent );
    Settings.write( KEYPREFIX+"/useAutoPhotometry", DataType.Boolean, data.useAutoPhotometry );

    // Join Region
    Settings.write( KEYPREFIX+"/joinSize", DataType.Float, data.joinSize );
    Settings.write( KEYPREFIX+"/joinPosition", DataType.Int32, data.joinPosition );
    Settings.write( KEYPREFIX+"/joinOutlierPercent", DataType.Float, data.joinOutlierPercent );
    
    // Replace/Update Region
    Settings.write( KEYPREFIX+"/cropTargetPreviewLeft", DataType.Int32, data.cropTargetPreviewRect.x0);
    Settings.write( KEYPREFIX+"/cropTargetPreviewTop", DataType.Int32, data.cropTargetPreviewRect.y0);
    Settings.write( KEYPREFIX+"/cropTargetPreviewWidth", DataType.Int32, data.cropTargetPreviewRect.width);
    Settings.write( KEYPREFIX+"/cropTargetPreviewHeight", DataType.Int32, data.cropTargetPreviewRect.height);
    Settings.write( KEYPREFIX+"/useCropTargetToReplaceRegion", DataType.Boolean, data.useCropTargetToReplaceRegion);
    
    // Gradient Sample Generation
    Settings.write( KEYPREFIX+"/sampleStarGrowthRate", DataType.Float, data.sampleStarGrowthRate );
    Settings.write( KEYPREFIX+"/sampleStarGrowthRateTarget", DataType.Float, data.sampleStarGrowthRateTarget );
    Settings.write( KEYPREFIX+"/limitSampleStarsPercent", DataType.Float, data.limitSampleStarsPercent );
    Settings.write( KEYPREFIX+"/sampleSize", DataType.Int32, data.sampleSize );
    Settings.write( KEYPREFIX+"/extraControls", DataType.Boolean, EXTRA_CONTROLS );
    if (EXTRA_CONTROLS){
        Settings.write( KEYPREFIX+"/maxSamples", DataType.Int32, data.maxSamples );
    }
    Settings.write( KEYPREFIX+"/useAutoSampleGeneration", DataType.Boolean, data.useAutoSampleGeneration );
    for (let i=0; i<data.manualRejectionCircles.length; i++){
        let mrc = data.manualRejectionCircles[i];
        Settings.write( KEYPREFIX+"/manualRejectionCircle" + i + "_x", DataType.Float, mrc.x);
        Settings.write( KEYPREFIX+"/manualRejectionCircle" + i + "_y", DataType.Float, mrc.y);
        Settings.write( KEYPREFIX+"/manualRejectionCircle" + i + "_overlapRadius", DataType.Int32, mrc.overlapRadius);
        Settings.write( KEYPREFIX+"/manualRejectionCircle" + i + "_targetRadius", DataType.Int32, mrc.targetRadius);
    }
        
    // Adjust Scale
    Settings.write( KEYPREFIX+"/adjustScale0", DataType.Float, data.adjustScale[0]);
    Settings.write( KEYPREFIX+"/adjustScale1", DataType.Float, data.adjustScale[1]);
    Settings.write( KEYPREFIX+"/adjustScale2", DataType.Float, data.adjustScale[2]);
    Settings.write( KEYPREFIX+"/adjustScaleLineOffset", DataType.Int32, data.adjustScaleLineOffset);
    
    // Gradient Correction (Overlap region)
    Settings.write( KEYPREFIX+"/overlapGradientSmoothness", DataType.Float, data.overlapGradientSmoothness );
    Settings.write( KEYPREFIX+"/taperLength", DataType.Int32, data.taperLength );
    Settings.write( KEYPREFIX+"/useAutoTaperLength", DataType.Boolean, data.useAutoTaperLength );
    
    // Gradient Correction (Target image)
    Settings.write( KEYPREFIX+"/useTargetGradientCorrection", DataType.Boolean, data.useTargetGradientCorrection );
    Settings.write( KEYPREFIX+"/targetGradientSmoothness", DataType.Float, data.targetGradientSmoothness );
    
    // Mosaic Star Mask
    Settings.write( KEYPREFIX+"/limitMaskStarsPercent", DataType.Float, data.limitMaskStarsPercent );
    Settings.write( KEYPREFIX+"/maskStarGrowthRate", DataType.Float, data.maskStarGrowthRate );
    Settings.write( KEYPREFIX+"/maskStarGrowthLimit", DataType.Int32, data.maskStarGrowthLimit );
    Settings.write( KEYPREFIX+"/maskStarRadiusAdd", DataType.Float, data.maskStarRadiusAdd );
    Settings.write( KEYPREFIX+"/useAutoMaskStarSize", DataType.Boolean, data.useAutoMaskStarSize );
    
    // Mosaic Join Mode
    Settings.write( KEYPREFIX+"/useMosaicOverlay", DataType.Boolean, data.useMosaicOverlay );
    Settings.write( KEYPREFIX+"/useMosaicRandom", DataType.Boolean, data.useMosaicRandom );
    Settings.write( KEYPREFIX+"/useMosaicAverage", DataType.Boolean, data.useMosaicAverage );
    Settings.write( KEYPREFIX+"/useJoinOrientationAuto", DataType.Boolean, data.useJoinOrientationAuto );
    Settings.write( KEYPREFIX+"/useJoinOrientationHorizontal", DataType.Boolean, data.useJoinOrientationHorizontal );
    Settings.write( KEYPREFIX+"/useJoinOrientationVertical", DataType.Boolean, data.useJoinOrientationVertical );
    Settings.write( KEYPREFIX+"/createJoinMask", DataType.Boolean, data.createJoinMask );
    
    Settings.write( KEYPREFIX+"/smallScreen", DataType.Boolean, data.smallScreen );
    
    Settings.write( KEYPREFIX+"/graphWidth", DataType.Int32, data.graphWidth );
    Settings.write( KEYPREFIX+"/graphHeight", DataType.Int32, data.graphHeight );
    
    console.writeln("\nSaved settings");
}

// A function to delete all previously stored settings keys for this script.
function resetSettings(){
   Settings.remove( KEYPREFIX );
}

/**
 * Restore all script parameters from settings keys.
 * @param {PhotometricMosaicData} data 
 */
function restoreSettings(data){
    let keyValue;
    keyValue = Settings.read( KEYPREFIX+"/referenceView", DataType.UCString );
    if ( Settings.lastReadOK ){
        let viewId = keyValue;
        data.referenceView = viewByIdSafe(viewId);
    }
    keyValue = Settings.read( KEYPREFIX+"/targetView", DataType.UCString );
    if ( Settings.lastReadOK ){
        let viewId = keyValue;
        data.targetView = viewByIdSafe(viewId);
    }
    
    keyValue = Settings.read( KEYPREFIX+"/replaceRefImage", DataType.Boolean );
    if ( Settings.lastReadOK )
        data.replaceRefImage = keyValue;
    
    data.hasPixelScale = true;
    keyValue = Settings.read( KEYPREFIX+"/pixelSize", DataType.Float );
    if ( Settings.lastReadOK ){
        data.pixelSize = keyValue;
    } else {
        data.hasPixelScale = false;
    }
    keyValue = Settings.read( KEYPREFIX+"/focalLength", DataType.Int32 );
    if ( Settings.lastReadOK ){
        data.focalLength = keyValue;
    } else {
        data.hasPixelScale = false;
    }
    
    // Star Detection
    keyValue = Settings.read( KEYPREFIX+"/refLogStarDetection", DataType.Float );
    if ( Settings.lastReadOK )
        data.refLogStarDetection = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/tgtLogStarDetection", DataType.Float );
    if ( Settings.lastReadOK )
        data.tgtLogStarDetection = keyValue;
    
    // Photometric Star Search
    keyValue = Settings.read( KEYPREFIX+"/starFluxTolerance", DataType.Float );
    if ( Settings.lastReadOK )
        data.starFluxTolerance = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/starSearchRadius", DataType.Float );
    if ( Settings.lastReadOK )
        data.starSearchRadius = keyValue;
    
    // Photometric Scale
    keyValue = Settings.read( KEYPREFIX+"/apertureGrowthRate", DataType.Float );
    if ( Settings.lastReadOK )
        data.apertureGrowthRate = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/apertureAdd", DataType.Int32 );
    if ( Settings.lastReadOK )
        data.apertureAdd = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/apertureGap", DataType.Int32 );
    if ( Settings.lastReadOK )
        data.apertureGap = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/apertureBgDelta", DataType.Int32 );
    if ( Settings.lastReadOK )
        data.apertureBgDelta = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/limitPhotoStarsPercent", DataType.Float );
    if ( Settings.lastReadOK )
        data.limitPhotoStarsPercent = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/linearRangeRef", DataType.Float );
    if ( Settings.lastReadOK )
        data.linearRangeRef = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/linearRangeTgt", DataType.Float );
    if ( Settings.lastReadOK )
        data.linearRangeTgt = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/outlierRemovalPercent", DataType.Float );
    if ( Settings.lastReadOK )
        data.outlierRemovalPercent = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/useAutoPhotometry", DataType.Boolean );
    if ( Settings.lastReadOK )
        data.useAutoPhotometry = keyValue;
    
    // Join Region
    keyValue = Settings.read( KEYPREFIX+"/joinSize", DataType.Float );
    if ( Settings.lastReadOK )
        data.joinSize = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/joinPosition", DataType.Int32 );
    if ( Settings.lastReadOK )
        data.joinPosition = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/joinOutlierPercent", DataType.Float );
    if ( Settings.lastReadOK )
        data.joinOutlierPercent = keyValue;
    
    // Replace/Update Region
    {
        let x = 0;
        let y = 0;
        let w = 1;
        let h = 1;
        keyValue = Settings.read( KEYPREFIX+"/cropTargetPreviewLeft", DataType.Int32 );
        if ( Settings.lastReadOK )
            x = keyValue;
        keyValue = Settings.read( KEYPREFIX+"/cropTargetPreviewTop", DataType.Int32 );
        if ( Settings.lastReadOK )
            y = keyValue;
        keyValue = Settings.read( KEYPREFIX+"/cropTargetPreviewWidth", DataType.Int32 );
        if ( Settings.lastReadOK )
            w = keyValue;
        keyValue = Settings.read( KEYPREFIX+"/cropTargetPreviewHeight", DataType.Int32 );
        if ( Settings.lastReadOK )
            h = keyValue;
        data.cropTargetPreviewRect = new Rect(x, y, x + w, y + h);

        keyValue = Settings.read( KEYPREFIX+"/useCropTargetToReplaceRegion", DataType.Boolean );
        if ( Settings.lastReadOK )
            data.useCropTargetToReplaceRegion = keyValue;
    }

    // Gradient Sample Generation
    keyValue = Settings.read( KEYPREFIX+"/sampleStarGrowthRate", DataType.Float );
    if ( Settings.lastReadOK )
        data.sampleStarGrowthRate = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/sampleStarGrowthRateTarget", DataType.Float );
    if ( Settings.lastReadOK )
        data.sampleStarGrowthRateTarget = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/limitSampleStarsPercent", DataType.Float );
    if ( Settings.lastReadOK )
        data.limitSampleStarsPercent = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/sampleSize", DataType.Int32 );
    if ( Settings.lastReadOK )
        data.sampleSize = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/extraControls", DataType.Boolean );
    if ( Settings.lastReadOK )
        EXTRA_CONTROLS = keyValue;
    if (EXTRA_CONTROLS){
        keyValue = Settings.read( KEYPREFIX+"/maxSamples", DataType.Int32 );
        if ( Settings.lastReadOK )
            data.maxSamples = keyValue;
    }
    keyValue = Settings.read( KEYPREFIX+"/useAutoSampleGeneration", DataType.Boolean );
    if ( Settings.lastReadOK )
        data.useAutoSampleGeneration = keyValue;
    for (let i=0; ; i++){
        let x, y, overlapR, targetR;
        keyValue = Settings.read( KEYPREFIX+"/manualRejectionCircle" + i + "_x", DataType.Float );
        if ( Settings.lastReadOK )
            x = keyValue;
        keyValue = Settings.read( KEYPREFIX+"/manualRejectionCircle" + i + "_y", DataType.Float );
        if ( Settings.lastReadOK )
            y = keyValue;
        keyValue = Settings.read( KEYPREFIX+"/manualRejectionCircle" + i + "_overlapRadius", DataType.Int32 );
        if ( Settings.lastReadOK )
            overlapR = keyValue;
        keyValue = Settings.read( KEYPREFIX+"/manualRejectionCircle" + i + "_targetRadius", DataType.Int32 );
        if ( Settings.lastReadOK )
            targetR = keyValue;
        
        if (x && y && overlapR && targetR){
            data.manualRejectionCircles.push(new ManualRejectionCircle(x, y, overlapR, targetR));
        } else {
            break;
        }
    }
    
    // Adjust Scale
    keyValue = Settings.read( KEYPREFIX+"/adjustScale0", DataType.Float );
    if ( Settings.lastReadOK )
        data.adjustScale[0] = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/adjustScale1", DataType.Float );
    if ( Settings.lastReadOK )
        data.adjustScale[1] = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/adjustScale2", DataType.Float );
    if ( Settings.lastReadOK )
        data.adjustScale[2] = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/adjustScaleLineOffset", DataType.Int32 );
    if ( Settings.lastReadOK )
        data.adjustScaleLineOffset = keyValue;
    
    // Gradient Correction (Overlap region)
    keyValue = Settings.read( KEYPREFIX+"/overlapGradientSmoothness", DataType.Float );
    if ( Settings.lastReadOK )
        data.overlapGradientSmoothness = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/taperLength", DataType.Int32 );
    if ( Settings.lastReadOK )
        data.taperLength = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/useAutoTaperLength", DataType.Boolean );
    if ( Settings.lastReadOK )
        data.useAutoTaperLength = keyValue;
    
    // Gradient Correction (Target image)
    keyValue = Settings.read( KEYPREFIX+"/useTargetGradientCorrection", DataType.Boolean );
    if ( Settings.lastReadOK )
        data.useTargetGradientCorrection = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/targetGradientSmoothness", DataType.Float );
    if ( Settings.lastReadOK )
        data.targetGradientSmoothness = keyValue;
    
    // Mosaic Star Mask
    keyValue = Settings.read( KEYPREFIX+"/limitMaskStarsPercent", DataType.Float );
    if ( Settings.lastReadOK )
        data.limitMaskStarsPercent = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/maskStarGrowthRate", DataType.Float );
    if ( Settings.lastReadOK )
        data.maskStarGrowthRate = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/maskStarGrowthLimit", DataType.Int32 );
    if ( Settings.lastReadOK )
        data.maskStarGrowthLimit = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/maskStarRadiusAdd", DataType.Float );
    if ( Settings.lastReadOK )
        data.maskStarRadiusAdd = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/useAutoMaskStarSize", DataType.Boolean );
    if ( Settings.lastReadOK )
        data.useAutoMaskStarSize = keyValue;
    
    // Mosaic Join Mode
    keyValue = Settings.read( KEYPREFIX+"/useMosaicOverlay", DataType.Boolean );
    if ( Settings.lastReadOK )
        data.useMosaicOverlay = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/useMosaicRandom", DataType.Boolean );
    if ( Settings.lastReadOK )
        data.useMosaicRandom = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/useMosaicAverage", DataType.Boolean );
    if ( Settings.lastReadOK )
        data.useMosaicAverage = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/useJoinOrientationAuto", DataType.Boolean );
    if ( Settings.lastReadOK )
        data.useJoinOrientationAuto = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/useJoinOrientationHorizontal", DataType.Boolean );
    if ( Settings.lastReadOK )
        data.useJoinOrientationHorizontal = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/useJoinOrientationVertical", DataType.Boolean );
    if ( Settings.lastReadOK )
        data.useJoinOrientationVertical = keyValue;    
    keyValue = Settings.read( KEYPREFIX+"/createJoinMask", DataType.Boolean );
    if ( Settings.lastReadOK )
        data.createJoinMask = keyValue;
    
    keyValue = Settings.read( KEYPREFIX+"/graphWidth", DataType.Int32 );
    if ( Settings.lastReadOK )
        data.graphWidth = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/graphHeight", DataType.Int32 );
    if ( Settings.lastReadOK )
        data.graphHeight = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/smallScreen", DataType.Boolean );
    if ( Settings.lastReadOK )
        data.smallScreen = keyValue;
}
