/* global ImageWindow, Parameters, View, TextAlignment.Right, TextAlignment.VertCenter, StdIcon.Error, StdButton.Ok, Dialog, StdButton.Yes, StdIcon.Question, StdButton.No, StdButton.Cancel, Settings, DataType.Float, KEYPREFIX, DataType.Int32, DataType.Boolean, StdButton.Abort, StdIcon.Warning, StdButton.Ignore, APERTURE_GROWTH, APERTURE_ADD, APERTURE_BKG_DELTA, APERTURE_GROWTH_TARGET, APERTURE_GROWTH_OVERLAP, APERTURE_GAP, DataType.UCString, StdDialogCode.Ok, PIXEL_SIZE_DEFAULT, FOCAL_LENGTH_DEFAULT, ISD_KEYPREFIX, FrameStyle.Sunken, DEFAULT_STAR_DETECTION, DEFAULT_STAR_SEARCH_RADIUS, DEFAULT_STAR_FLUX_TOLERANCE, DEFAULT_OUTLIER_PERCENT, DEFAULT_OVERLAP_GRADIENT_SMOOTHNESS, DEFAULT_TARGET_GRADIENT_SMOOTHNESS, DEFAULT_JOIN_SIZE */

//"use strict";

let EXTRA_CONTROLS = false;

// The main dialog function
class PhotometricMosaicDialog extends Dialog
{
constructor(data)
{
super();

    let self = this;
    
    this.onToggleSection = function(bar, beginToggle){
        if (beginToggle){
            this.dialog.setVariableSize();
        } else {
//            bar.updateSection();
            this.dialog.setFixedSize();
        }
    };
    
    // =======================================
    // SectionBar: "Quick Start Guide"
    // =======================================
    // Create the Program Description at the top
    let titleLabel = createTitleLabel(
        "<b>Creates a mosaic from linear images</b><br />" +
        "(1) Use NormalizeScaleGradient (NSG) during preprocessing.<br />" +
        "(2) Read help sections: <i>Prerequisites</i> and <i>Quick Start Guide</i><br />" +
        "(3) Use script <i>Mosaic -> MosaicByCoordinates</i> to register your plate solved images.<br />" +
        "(4) Use script <i>Mosaic -> TrimMosaicTile</i> to erode away incomplete data and soft edges.<br />" +
        "(5) Join linear frames into either rows or columns, and then join these strips to create the final mosaic.<br />" +
        "(6) After 27,000 lines of code, I would be extremely grateful for a coffee <b><u>https://ko-fi.com/jmurphy</u></b> Thanks!<br />" +
        "Copyright &copy; 2019-2025 John Murphy, Website: <b><u>https://astroprocessing.com/</u></b><br />" +
        "<i>I would also like to thank Adam Block for his advice and ideas.</i>");
    titleLabel.toolTip = "https://ko-fi.com/jmurphy";
    titleLabel.onMousePress = function( x, y, button, buttonState, modifiers ){
        (new HelpDialog()).execute();
    };
    let titleSection = new Control(this);
    titleSection.sizer = new VerticalSizer;
    titleSection.sizer.add(titleLabel);
    titleSection.setMinSize(750, 60);
    let titleBar = new SectionBar(this, "Photometric Mosaic V" + VERSION());
    titleBar.setSection(titleSection);
    titleBar.onToggleSection = this.onToggleSection;
    // SectionBar "Quick Start Guide" End

    // =======================================
    // SectionBar: "Reference & Target Views"
    // =======================================
    function setPixelScaleAutoValues(){
        self.setApertureGapAutoValue();
        self.setApertureBgDeltaAutoValue();
        self.setSampleSizeAutoValue();
        self.setTaperLengthAutoValue(data);
    }
    
    let REFERENCE_VIEW_STR_LEN = this.font.width("Reference view:");
    let referenceImage_Label = new Label(this);
    referenceImage_Label.text = "Reference view:";
    referenceImage_Label.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
    referenceImage_Label.minWidth = REFERENCE_VIEW_STR_LEN;
    referenceImage_Label.toolTip = "<p>The target image will be matched to this reference image. " +
            "The reference image is not modified.</p>";

    this.referenceImage_ViewList = new ViewList(this);
    this.referenceImage_ViewList.getMainViews();
    this.referenceImage_ViewList.minWidth = 470;
    this.referenceImage_ViewList.currentView = data.referenceView;
    this.referenceImage_ViewList.onViewSelected = function (view) {
        let hasChanged = data.referenceView.fullId !== view.fullId;
        data.referenceView = view;
        data.cache.setUserInputData(data.referenceView.fullId, data.targetView.fullId, 
                data.refLogStarDetection, data.tgtLogStarDetection);
        self.setLinearRangeAutoValue();
        self.enableReplaceUpdateRegion(false);
        self.enableAdjustScaleControls(data.cache.isColor());
        if (hasChanged){
            self.resetAdjustScaleControls();
            self.setJoinPosition(0);
            data.manualRejectionCircles = [];
            updateJoinOrientation(true, false, false);
        }
    };

    let referenceImage_Sizer = new HorizontalSizer(this);
    referenceImage_Sizer.spacing = 4;
    referenceImage_Sizer.add(referenceImage_Label);
    referenceImage_Sizer.add(this.referenceImage_ViewList, 100);

    /**
     * Get pixel scale from FITS header. If focal length or pixel size does not
     * exist, display the ImageScaleDialog.
     * Display the focal length, pixel size and image scale in the PhotometricMosaicDialog.
     * @param {PhotometricMosaicDialog} data
     */
    this.getPixelScaleFromHdr = function(data){
        data.pixelSize = getPixelSize(data.targetView, 0);
        data.focalLength = getFocalLength(data.targetView, 0);
        if (!data.pixelSize || !data.focalLength){
            let imageScaleDialog = new ImageScaleDialog( data.pixelSize, data.focalLength, ISD_KEYPREFIX, false );
            if (StdDialogCode.Ok === imageScaleDialog.execute()){
                data.pixelSize = imageScaleDialog.getPixelSize();
                data.focalLength = imageScaleDialog.getFocalLength();
            } else {
                data.pixelSize = data.pixelSize ? data.pixelSize : PIXEL_SIZE_DEFAULT;
                data.focalLength = data.focalLength ? data.focalLength : FOCAL_LENGTH_DEFAULT;
            }
        }
        self.setPixelScaleFields();
        setPixelScaleAutoValues();
        data.hasPixelScale = true;
    };

    let targetImage_Label = new Label(this);
    targetImage_Label.text = "Target view:";
    targetImage_Label.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
    targetImage_Label.minWidth = REFERENCE_VIEW_STR_LEN;
    targetImage_Label.toolTip = 
        "<p>A copy of the target image will be multiplied by the photometrically determined scale factor. " +
        "The gradient will then be calculated and subtracted.</p>";

    this.targetImage_ViewList = new ViewList(this);
    this.targetImage_ViewList.getMainViews();
    this.targetImage_ViewList.minWidth = 470;
    this.targetImage_ViewList.currentView = data.targetView;
    this.targetImage_ViewList.onViewSelected = function (view) {
        let hasChanged = data.targetView.fullId !== view.fullId;
        data.targetView = view;
        data.cache.setUserInputData(data.referenceView.fullId, data.targetView.fullId, 
                data.refLogStarDetection, data.tgtLogStarDetection);      
        if (hasChanged && !data.targetView.isNull){
            self.getPixelScaleFromHdr(data);
        } else {
            setPixelScaleAutoValues();
        }
        self.setLinearRangeAutoValue();
        self.enableReplaceUpdateRegion(false);
        self.enableAdjustScaleControls(data.cache.isColor());
        if (hasChanged){
            self.resetAdjustScaleControls();
            self.setJoinPosition(0);
            data.manualRejectionCircles = [];
            updateJoinOrientation(true, false, false);
        }
    };

    let targetImage_Sizer = new HorizontalSizer(this);
    targetImage_Sizer.spacing = 4;
    targetImage_Sizer.add(targetImage_Label);
    targetImage_Sizer.add(this.targetImage_ViewList, 100);
    
    let focalLength_Label = new Label( this );
    focalLength_Label.text = "Focal length:";
    focalLength_Label.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
    focalLength_Label.enabled = false;
    let focalLengthControl = new Label(this);
    focalLengthControl.frameStyle = FrameStyle.Sunken;
    focalLengthControl.textAlignment = TextAlignment.VertCenter;
    focalLengthControl.toolTip = "Focal length in mm";
    
    let  pixelSize_Label = new Label( this );
    pixelSize_Label.text = "Pixel size:";
    pixelSize_Label.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
    let pixelSizeControl = new Label(this);
    pixelSizeControl.frameStyle = FrameStyle.Sunken;
    pixelSizeControl.textAlignment = TextAlignment.VertCenter;
    pixelSizeControl.toolTip = "Pixel size, including binning, in microns";
    
    let  pixelScale_Label = new Label( this );
    pixelScale_Label.text = "Pixel scale:";
    pixelScale_Label.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
    let pixelScaleControl = new Label(this);
    pixelScaleControl.frameStyle = FrameStyle.Sunken;
    pixelScaleControl.textAlignment = TextAlignment.VertCenter;
    pixelScaleControl.toolTip = "Pixel scale in arcseconds";
    
    let imageScaleButton = new PushButton(this);
    imageScaleButton.text = "Image scale";
    imageScaleButton.toolTip =
            "<p>Manually set the focal length and pixel size.</p>";
    imageScaleButton.onClick = function () {
        try {
            let imageScaleDialog = new ImageScaleDialog( data.pixelSize, data.focalLength, ISD_KEYPREFIX, true );
            if (StdDialogCode.Ok === imageScaleDialog.execute()){
                data.pixelSize = imageScaleDialog.getPixelSize();
                data.focalLength = imageScaleDialog.getFocalLength();
                self.setPixelScaleFields();
                setPixelScaleAutoValues();
                data.hasPixelScale = true;
            }
        } catch (error){
            console.criticalln("**ERROR: ", error);
        }
    };
    
    let imageScaleGroupBox = new GroupBox(this);
    imageScaleGroupBox.title = "Image scale";
    imageScaleGroupBox.sizer = new HorizontalSizer;
    imageScaleGroupBox.sizer.margin = 2;
    imageScaleGroupBox.sizer.spacing = 4;
    imageScaleGroupBox.sizer.add(focalLength_Label);
    imageScaleGroupBox.sizer.add(focalLengthControl);
    imageScaleGroupBox.sizer.addSpacing(10);
    imageScaleGroupBox.sizer.add(pixelSize_Label);
    imageScaleGroupBox.sizer.add(pixelSizeControl);
    imageScaleGroupBox.sizer.addSpacing(10);
    imageScaleGroupBox.sizer.add(pixelScale_Label);
    imageScaleGroupBox.sizer.add(pixelScaleControl);
    imageScaleGroupBox.sizer.addSpacing(20);
    imageScaleGroupBox.sizer.add(imageScaleButton);
    imageScaleGroupBox.sizer.addSpacing(2);
    
    this.replaceRefCheckBox = new CheckBox(this);
    this.replaceRefCheckBox.text = "Replace reference image.";
    this.replaceRefCheckBox.toolTip = 
            "<p>If selected, the mosaic will replace the reference image.</p>" +
            "<p>If deselected, the mosaic will be created as a new image.</p>";
    this.replaceRefCheckBox.onCheck = function (checked){
        data.replaceRefImage = checked;
    };
    this.replaceRefCheckBox.checked = data.replaceRefImage;
    
    let createOrReplaceGroupBox = new GroupBox(this);
    createOrReplaceGroupBox.title = "Replace or create new image";
    createOrReplaceGroupBox.sizer = new HorizontalSizer;
    createOrReplaceGroupBox.sizer.margin = 2;
    createOrReplaceGroupBox.sizer.addSpacing(2);
    createOrReplaceGroupBox.sizer.add(this.replaceRefCheckBox);
    createOrReplaceGroupBox.sizer.addStretch();
    
    let imageScale_createOrReplace_sizer = new HorizontalSizer();
    imageScale_createOrReplace_sizer.margin = 2;
    imageScale_createOrReplace_sizer.add(createOrReplaceGroupBox);
    imageScale_createOrReplace_sizer.addSpacing(10);
    imageScale_createOrReplace_sizer.add(imageScaleGroupBox);
    
    /**
     * Displays the focal length, pixel size and pixel scale to the user
     */
    this.setPixelScaleFields = function(){
        pixelSizeControl.text = data.pixelSize ? data.pixelSize.toFixed(2) : "0";
        focalLengthControl.text = data.focalLength.toFixed(0);
        let pixelScale = calcDegreesPerPixel(data.pixelSize, data.focalLength) * 3600;
        pixelScaleControl.text = pixelScale.toFixed(2);
        CoreApplication.processEvents();
    };
    data.pixelSize = getPixelSize(data.targetView, data.pixelSize);
    data.focalLength = getFocalLength(data.targetView, data.focalLength);
    this.setPixelScaleFields();
    
    let selectViewSection = new Control(this);
    selectViewSection.sizer = new VerticalSizer;
    selectViewSection.sizer.spacing = 4;
    selectViewSection.sizer.add(referenceImage_Sizer);
    selectViewSection.sizer.add(targetImage_Sizer);
    selectViewSection.sizer.add(imageScale_createOrReplace_sizer);
    let selectViewBar = new SectionBar(this, "Reference & Target Views");
    selectViewBar.setSection(selectViewSection);
    selectViewBar.onToggleSection = this.onToggleSection;
    selectViewBar.toolTip = "Select the reference and target images.";
    // SectionBar "Reference & Target Views" End

    // =======================================
    // SectionBar: "Star Detection"
    // =======================================
    let starDetectionControls = new StarDetectionControls();
    this.refLogStarDetection_Control = starDetectionControls.createRefLogStarDetect_Control(this, data, 0);
    this.tgtLogStarDetection_Control = starDetectionControls.createTgtLogStarDetect_Control(this, data, 0);
    
    let refDetectedStars_Reset = starDetectionControls.createStarDetectResetControl(this);
    refDetectedStars_Reset.onClick = function(){
        try {
            data.refLogStarDetection = DEFAULT_STAR_DETECTION;
            self.refLogStarDetection_Control.setValue(data.refLogStarDetection);
            data.cache.updateStarDetection(data.refLogStarDetection, data.tgtLogStarDetection);
        } catch (e){
            console.criticalln("** ERROR: ", e);
        }
    };
    let tgtDetectedStars_Reset = starDetectionControls.createStarDetectResetControl(this);
    tgtDetectedStars_Reset.onClick = function(){
        try {
            data.tgtLogStarDetection = DEFAULT_STAR_DETECTION;
            self.tgtLogStarDetection_Control.setValue(data.tgtLogStarDetection);
            data.cache.updateStarDetection(data.refLogStarDetection, data.tgtLogStarDetection);
        } catch (e){
            console.criticalln("** ERROR: ", e);
        }
    };
    
    let detectedStarsButton = new PushButton(this);
    detectedStarsButton.text = "Detected stars ";
    detectedStarsButton.toolTip =
            "<p>Displays the detected stars and provides star detection controls.</p>";
    detectedStarsButton.onClick = function () {
        data.viewFlag = DISPLAY_DETECTED_STARS();
        this.dialog.ok();
    };
    
    let starDetectionSection = new Control(this);
    starDetectionSection.sizer = new HorizontalSizer;
    starDetectionSection.sizer.spacing = 2;
    starDetectionSection.sizer.add(this.refLogStarDetection_Control, 100);
    starDetectionSection.sizer.add(refDetectedStars_Reset, 0);
    starDetectionSection.sizer.addSpacing(4);
    starDetectionSection.sizer.add(this.tgtLogStarDetection_Control, 92);
    starDetectionSection.sizer.add(tgtDetectedStars_Reset, 0);
    starDetectionSection.sizer.addSpacing(4);
    starDetectionSection.sizer.add(detectedStarsButton, 0);
    let starDetectionBar = new SectionBar(this, "Star Detection");
    starDetectionBar.setSection(starDetectionSection);
    starDetectionBar.onToggleSection = this.onToggleSection;
    starDetectionBar.toolTip = "<p>Star detection sensitivity.</p>";
    // SectionBar "Star Detection" End
    
    let photometrySearchSection;
    let photometrySearchBar;

    // =======================================
    // SectionBar: "Photometric Star Search"
    // =======================================
    const labelWidth = Math.max(
            this.font.width("Star flux tolerance:"), 
            this.font.width("Star search radius:"));
    this.starFluxTolerance_Control = new NumericControl(this);
    this.starFluxTolerance_Control.real = true;
    this.starFluxTolerance_Control.label.text = "Star flux tolerance:";
    this.starFluxTolerance_Control.toolTip =
            "<p>Star flux tolerance is used to prevent invalid target to reference " +
            "star matches. Smaller values reject more matches.</p>" +
            "<p>Star matches are rejected if the difference in star flux " +
            "is larger than expected. The algorithm first calculates the average scale difference, " +
            "and then rejects matches if their brightness ratio is greater than " +
            "(expected ratio * tolerance) or smaller than (expected ratio / tolerance)</p>" +
            "<p>1.0 implies the star flux ratio must exactly match the expected ratio.</p>" +
            "<p>2.0 implies that the ratio can be double or half the expected ratio.</p>" +
            "<p>You usually don't need to modify this parameter.</p>";
    this.starFluxTolerance_Control.label.minWidth = labelWidth;
    this.starFluxTolerance_Control.setRange(1.01, 2);
    this.starFluxTolerance_Control.slider.setRange(100, 200);
    this.starFluxTolerance_Control.setPrecision(2);
    this.starFluxTolerance_Control.slider.minWidth = 100;
    this.starFluxTolerance_Control.setValue(data.starFluxTolerance);
    this.starFluxTolerance_Control.onValueUpdated = function (value) {
        data.starFluxTolerance = value;
    };
    
    let starFluxTolerance_Reset = createResetControl(this, "<p>Reset star flux tolerance to default.</p>");
    starFluxTolerance_Reset.onClick = function(){
        data.starFluxTolerance = DEFAULT_STAR_FLUX_TOLERANCE;
        self.starFluxTolerance_Control.setValue(data.starFluxTolerance);
    };
    let starFluxToleranceSizer = new HorizontalSizer(this);
    starFluxToleranceSizer.spacing = 5;
    starFluxToleranceSizer.add(this.starFluxTolerance_Control, 100);
    starFluxToleranceSizer.add(starFluxTolerance_Reset, 0);

    this.starSearchRadius_Control = new NumericControl(this);
    this.starSearchRadius_Control.real = true;
    this.starSearchRadius_Control.label.text = "Star search radius:";
    this.starSearchRadius_Control.toolTip =
            "<p>Search radius used to match the reference and target stars. " +
            "Larger values find more photometric stars but at the risk of matching " +
            "the wrong star.</p>" +
            "<p>You only need to modify this parameter if your images contain distortions.</p>";

    this.starSearchRadius_Control.label.minWidth = labelWidth;
    this.starSearchRadius_Control.setRange(1, 10);
    this.starSearchRadius_Control.slider.setRange(1, 100);
    this.starSearchRadius_Control.setPrecision(1);
    this.starSearchRadius_Control.slider.minWidth = 100;
    this.starSearchRadius_Control.setValue(data.starSearchRadius);
    this.starSearchRadius_Control.onValueUpdated = function (value) {
        data.starSearchRadius = value;
    };
    
    let starSearchRadius_Reset = createResetControl(this, "<p>Reset star search radius to default.</p>");
    starSearchRadius_Reset.onClick = function(){
        data.starSearchRadius = DEFAULT_STAR_SEARCH_RADIUS;
        self.starSearchRadius_Control.setValue(data.starSearchRadius);
    };
    let starSearchRadiusSizer = new HorizontalSizer(this);
    starSearchRadiusSizer.spacing = 5;
    starSearchRadiusSizer.add(this.starSearchRadius_Control, 100);
    starSearchRadiusSizer.add(starSearchRadius_Reset, 0);

    photometrySearchSection = new Control(this);
    photometrySearchSection.sizer = new VerticalSizer;
    photometrySearchSection.sizer.spacing = 4;
    photometrySearchSection.sizer.add(starFluxToleranceSizer);
    photometrySearchSection.sizer.add(starSearchRadiusSizer);
    photometrySearchBar = new SectionBar(this, "Photometry Star Search");
    photometrySearchBar.setSection(photometrySearchSection);
    photometrySearchBar.onToggleSection = this.onToggleSection;
    photometrySearchBar.toolTip = "<p>Search criteria used to match reference and target stars.</p>" +
            "<p>The default settings usually work well.</p>";
    // SectionBar: "Photometric Star Search" End
    
    // =======================================
    // SectionBar: "Photometry"
    // =======================================
    let photometryControls = new PhotometryControls();
    
    this.apertureGrowthRate_Control = photometryControls.createApertureGrowthRateEdit(this, data);
    this.apertureGrowthRate_Control.onValueUpdated = function (value){
        data.apertureGrowthRate = value;
    };
    this.apertureAdd_Control = photometryControls.createApertureAddEdit(this, data);
    this.apertureAdd_Control.onValueUpdated = function (value){
        data.apertureAdd = value;
    };
    this.apertureGap_Control = photometryControls.createApertureGapEdit(this, data);
    this.apertureGap_Control.onValueUpdated = function (value){
        data.apertureGap = value;
    };
    this.apertureBgDelta_Control = photometryControls.createApertureBgDeltaEdit(this, data);
    this.apertureBgDelta_Control.onValueUpdated = function (value){
        data.apertureBgDelta = value;
    };
    let photometryStarsButton = new PushButton(this);
    photometryStarsButton.text = "Photometry stars ";
    photometryStarsButton.toolTip =
            "<p>Displays the photometry stars.</p>" + 
            "<p>Provides all the photometry controls.</p>";
    photometryStarsButton.onClick = function () {
        data.viewFlag = DISPLAY_PHOTOMETRY_STARS();
        this.dialog.ok();
    };
    let apertureGroupBox = new GroupBox(this);
    apertureGroupBox.title = "Star aperture size";
    apertureGroupBox.sizer = new HorizontalSizer();
    apertureGroupBox.sizer.margin = 2;
    apertureGroupBox.sizer.spacing = 10;
    apertureGroupBox.sizer.add(this.apertureAdd_Control);
    apertureGroupBox.sizer.add(this.apertureGrowthRate_Control);
    apertureGroupBox.sizer.add(this.apertureGap_Control);
    apertureGroupBox.sizer.add(this.apertureBgDelta_Control);
    apertureGroupBox.sizer.addStretch();
    
    this.limitPhotoStarsPercent_Control = 
            photometryControls.createLimitPhotoStarsPercentEdit(this, data);
    this.limitPhotoStarsPercent_Control.onValueUpdated = function (value){
        data.limitPhotoStarsPercent = value;
    };
    
    this.linearRangeRef_Control = photometryControls.createLinearRangeRefEdit(this, data);
    this.linearRangeRef_Control.onValueUpdated = function (value){
        data.linearRangeRef = value;
    };
    
    this.linearRangeTgt_Control = photometryControls.createLinearRangeTgtEdit(this, data);
    this.linearRangeTgt_Control.onValueUpdated = function (value){
        data.linearRangeTgt = value;
    };
    
    this.outlierRemoval_Control = 
            photometryControls.createOutlierRemovalEdit(this, data);
    this.outlierRemoval_Control.onValueUpdated = function (value){
        data.outlierRemovalPercent = value;
    };
    
    let photometryGraphButton = new PushButton(this);
    photometryGraphButton.text = "Photometry graph";
    photometryGraphButton.toolTip =
            "<p>Displays the photometry graph. " +
            "For each star, the flux measured in the reference image is plotted " +
            "against the flux measured in the target image. " +
            "A best fit line is drawn through these points. " +
            "The gradient provides the brightness scale factor.</p>" +
            "<p>Provides all the photometry controls.</p>";
    photometryGraphButton.onClick = function () {
        data.viewFlag = DISPLAY_PHOTOMETRY_GRAPH();
        this.dialog.ok();
    };
    
    let filterGroupBox = new GroupBox(this);
    filterGroupBox.title = "Filter photometry stars";
    filterGroupBox.sizer = new HorizontalSizer(filterGroupBox);
    filterGroupBox.sizer.margin = 2;
    filterGroupBox.sizer.spacing = 10;
    filterGroupBox.sizer.add(this.limitPhotoStarsPercent_Control);
    filterGroupBox.sizer.add(this.outlierRemoval_Control);
    filterGroupBox.sizer.addStretch();
    
    let linearGroupBox = new GroupBox(this);
    linearGroupBox.title = "Linear range";
    linearGroupBox.sizer = new HorizontalSizer(linearGroupBox);
    linearGroupBox.sizer.margin = 2;
    linearGroupBox.sizer.spacing = 10;
    linearGroupBox.sizer.add(this.linearRangeRef_Control);
    linearGroupBox.sizer.add(this.linearRangeTgt_Control);
    linearGroupBox.sizer.addStretch();
    
    let starButtonGroupBox = new GroupBox(this);
    starButtonGroupBox.title = "Edit / Display";
    starButtonGroupBox.sizer = new HorizontalSizer(starButtonGroupBox);
    starButtonGroupBox.sizer.margin = 2;
    starButtonGroupBox.sizer.addSpacing(2);
    starButtonGroupBox.sizer.add(photometryStarsButton);
    starButtonGroupBox.sizer.addSpacing(2);
    
    let graphButtonGroupBox = new GroupBox(this);
    graphButtonGroupBox.title = "Edit / Display";
    graphButtonGroupBox.sizer = new HorizontalSizer(starButtonGroupBox);
    graphButtonGroupBox.sizer.margin = 2;
    graphButtonGroupBox.sizer.addSpacing(2);
    graphButtonGroupBox.sizer.add(photometryGraphButton);
    graphButtonGroupBox.sizer.addSpacing(2);
    
    this.autoPhotometryCheckBox = new CheckBox(this);
    this.autoPhotometryCheckBox.text = "Auto";
    this.autoPhotometryCheckBox.toolTip = 
            "<p>Sets all controls, except for 'Outlier removal', to calculated values.</p>";
    this.autoPhotometryCheckBox.onCheck = function (checked){
        self.setPhotometryAutoValues(checked);
    };
    
    let photometryAutoGroupBox = new GroupBox(this);
    photometryAutoGroupBox.sizer = new HorizontalSizer();
    photometryAutoGroupBox.sizer.margin = 2;
    photometryAutoGroupBox.sizer.addSpacing(10);
    photometryAutoGroupBox.sizer.add(this.autoPhotometryCheckBox);
    photometryAutoGroupBox.sizer.addSpacing(10);
    
    let apertureHorizSizer = new HorizontalSizer();
    apertureHorizSizer.spacing = 12;
    apertureHorizSizer.add(apertureGroupBox, 100);
    apertureHorizSizer.add(photometryAutoGroupBox);
    apertureHorizSizer.add(starButtonGroupBox);
    
    let filterHorizSizer = new HorizontalSizer();
    filterHorizSizer.spacing = 12;
    filterHorizSizer.add(filterGroupBox, 100);
    filterHorizSizer.add(linearGroupBox, 100);
    filterHorizSizer.add(graphButtonGroupBox);

    let photometrySection = new Control(this);
    photometrySection.sizer = new VerticalSizer();
    photometrySection.sizer.spacing = 4;
    photometrySection.sizer.add(apertureHorizSizer);
    photometrySection.sizer.add(filterHorizSizer);
    let photometryBar = new SectionBar(this, "Photometry");
    photometryBar.setSection(photometrySection);
    photometryBar.onToggleSection = this.onToggleSection;
    photometryBar.toolTip = "<p>Specifies photometry parameters. These are used " +
            " to calculate the brightness scale factor.</p>";
    // SectionBar: "Photometric Scale" End
    
    this.setPhotometryAutoValues = function (checked){
        data.useAutoPhotometry = checked;
        self.autoPhotometryCheckBox.checked = checked;
        self.apertureAdd_Control.enabled = !checked;
        self.apertureGrowthRate_Control.enabled = !checked;
        self.apertureGap_Control.enabled = !checked;
        self.apertureBgDelta_Control.enabled = !checked;
        self.limitPhotoStarsPercent_Control.enabled = !checked;
        self.outlierRemoval_Control.enabled = !checked;
        self.linearRangeRef_Control.enabled = !checked;
        self.linearRangeTgt_Control.enabled = !checked;
        if (checked){
            self.setApertureAddAutoValue();
            self.setApertureGrowthRateAutoValue(false);
            self.setApertureGapAutoValue();
            self.setApertureBgDeltaAutoValue();
            self.setLimitPhotoStarsPercentAutoValue();
            self.setOutlierRemovalPercentAutoValue();
            self.setLinearRangeAutoValue();
        }
    };
    this.setApertureAddAutoValue = function(){
        if (data.useAutoPhotometry){
            data.apertureAdd = APERTURE_ADD;
            self.apertureAdd_Control.setValue(data.apertureAdd);
        } 
    };
    /**
     * @param {Boolean} calculate
     */
    this.setApertureGrowthRateAutoValue = function(calculate){
        if (data.useAutoPhotometry){
            let maxStarFlux = data.cache.getMaxStarFlux(calculate);
            let limit = Math.round(calcDefaultGrowthLimit(data));
            limit = Math.max(limit, 2);
            data.apertureGrowthRate = calcStarGrowthRate(maxStarFlux, APERTURE_GROWTH, limit);
            self.apertureGrowthRate_Control.setValue(data.apertureGrowthRate);
        } 
    };
    this.setApertureGapAutoValue = function(){
        if (data.useAutoPhotometry){
            let gap = calcDefaultApertureGap(data);
            data.apertureGap = Math.min(gap, self.apertureGap_Control.upperBound);
            self.apertureGap_Control.setValue(data.apertureGap);
        } 
    };
    this.setApertureBgDeltaAutoValue = function(){
        if (data.useAutoPhotometry){
            let bgDelta = calcDefaultApertureBgDelta(data);
            data.apertureBgDelta = Math.min(bgDelta, self.apertureBgDelta_Control.upperBound);
            self.apertureBgDelta_Control.setValue(data.apertureBgDelta);
        } 
    };
    this.setLimitPhotoStarsPercentAutoValue = function(){
        if (data.useAutoPhotometry){
            data.limitPhotoStarsPercent = 100;
            self.limitPhotoStarsPercent_Control.setValue(data.limitPhotoStarsPercent);
        } 
    };
    this.setOutlierRemovalPercentAutoValue = function(){
        if (data.useAutoPhotometry){
            data.outlierRemovalPercent = 2;
            self.outlierRemoval_Control.setValue(data.outlierRemovalPercent);
        } 
    };
    this.setLinearRangeAutoValue = function(){
        if (data.useAutoPhotometry){
            data.linearRangeRef = data.cache.getLinearRangeRef();
            self.linearRangeRef_Control.setValue(data.linearRangeRef);
            data.linearRangeTgt = data.cache.getLinearRangeTgt();
            self.linearRangeTgt_Control.setValue(data.linearRangeTgt);
        } 
    };
    data.cache.setUserInputData(data.referenceView.fullId, data.targetView.fullId, 
            data.refLogStarDetection, data.tgtLogStarDetection);
    this.setPhotometryAutoValues(data.useAutoPhotometry);

    // =======================================
    // SectionBar: "Sample Generation"
    // =======================================
    const sampleGenerationStrLen = this.font.width("Multiply star radius:");
    let sampleControls = new SampleControls;

    this.limitSampleStarsPercent_Control = sampleControls.createLimitSampleStarsPercentEdit(this, data);       
    this.limitSampleStarsPercent_Control.onValueUpdated = function (value) {
        data.limitSampleStarsPercent = value;
    };
    
    let filterSampleStarsGroupBox = new GroupBox(this);
    filterSampleStarsGroupBox.title = "Filter stars";
    filterSampleStarsGroupBox.sizer = new HorizontalSizer();
    filterSampleStarsGroupBox.sizer.margin = 2;
    filterSampleStarsGroupBox.sizer.spacing = 10;
    filterSampleStarsGroupBox.sizer.add(this.limitSampleStarsPercent_Control);
    filterSampleStarsGroupBox.sizer.addStretch();
    
    this.sampleStarGrowthRate_Control = sampleControls.createSampleStarGrowthRateEdit(this, data);    
    this.sampleStarGrowthRate_Control.onValueUpdated = function (value){
        data.sampleStarGrowthRate = value;
    };
    
    this.sampleStarGrowthRateTarget_Control = sampleControls.createSampleStarGrowthRateTargetEdit(this, data);
    this.sampleStarGrowthRateTarget_Control.onValueUpdated = function (value){
        data.sampleStarGrowthRateTarget = value;
    };
    
    this.autoSampleGenerationCheckBox = new CheckBox(this);
    this.autoSampleGenerationCheckBox.text = "Auto";
    this.autoSampleGenerationCheckBox.toolTip = 
            "<p>Calculates default values for most of the Sample Generation parameters.</p>" +
            "<p>These are calculated from the headers:" +
            "<ul><li><b>'XPIXSZ'</b> (Pixel size, including binning, in microns)</li>" +
            "<li><b>'FOCALLEN'</b> (Focal length in mm).</li></p>";
    this.autoSampleGenerationCheckBox.onCheck = function (checked){
        self.setSampleGenerationAutoValues(checked);
    };
    
    let sampleAutoGroupBox = new GroupBox(this);
    sampleAutoGroupBox.sizer = new HorizontalSizer();
    sampleAutoGroupBox.sizer.margin = 2;
    sampleAutoGroupBox.sizer.addSpacing(10);
    sampleAutoGroupBox.sizer.add(this.autoSampleGenerationCheckBox);
    sampleAutoGroupBox.sizer.addSpacing(10);
    
    let sampleStarRejectRadiusGroupBox = new GroupBox(this);
    sampleStarRejectRadiusGroupBox.title = "Overlap model sample rejection";
    sampleStarRejectRadiusGroupBox.toolTip = "<p>This section determines which " +
            "samples are used to create the Overlap region's relative gradient model. " +
            "This determines the gradient correction applied to the Overlap region.</p>" +
            "<p>The aim is to reject samples that contain bright stars. " +
            "It is not necessary to reject samples that only contain filter halos " +
            "or the scattered light around bright stars.</p>";
    sampleStarRejectRadiusGroupBox.sizer = new HorizontalSizer();
    sampleStarRejectRadiusGroupBox.sizer.margin = 2;
    sampleStarRejectRadiusGroupBox.sizer.spacing = 10;
    sampleStarRejectRadiusGroupBox.sizer.add(this.sampleStarGrowthRate_Control);
    sampleStarRejectRadiusGroupBox.sizer.addStretch();
    
    let sampleStarRejectRadiusGroupBox2 = new GroupBox(this);
    sampleStarRejectRadiusGroupBox2.title = "Target model sample rejection";
    sampleStarRejectRadiusGroupBox2.toolTip = "<p>This section determines which " +
            "samples are used to create the relative gradient model that will be " +
            "used to correct the rest of the target image.</p>" +
            "<p>The aim is to reject samples that cover any light from bright stars. " +
            "This includes diffraction spikes, filter halos " +
            "and the scattered light around bright stars.</p>";
    sampleStarRejectRadiusGroupBox2.sizer = new HorizontalSizer();
    sampleStarRejectRadiusGroupBox2.sizer.margin = 2;
    sampleStarRejectRadiusGroupBox2.sizer.spacing = 10;
    sampleStarRejectRadiusGroupBox2.sizer.add(this.sampleStarGrowthRateTarget_Control);
    sampleStarRejectRadiusGroupBox2.sizer.addStretch();
    
    let sampleStarRejectRadiusSizer = new HorizontalSizer();
    sampleStarRejectRadiusSizer.spacing = 12;
    sampleStarRejectRadiusSizer.add(sampleStarRejectRadiusGroupBox, 50);
    sampleStarRejectRadiusSizer.add(sampleStarRejectRadiusGroupBox2, 50);
    
    this.sampleSize_Control = sampleControls.createSampleSizeEdit(
            this, data, sampleControls.sampleSize.range.max);
    this.sampleSize_Control.onValueUpdated = function (value) {
        data.sampleSize = value;
    };
   
    let sampleSizeGroupBox = new GroupBox(this);
    sampleSizeGroupBox.title = "Samples";
    sampleSizeGroupBox.sizer = new HorizontalSizer();
    sampleSizeGroupBox.sizer.margin = 2;
    sampleSizeGroupBox.sizer.spacing = 10;
    sampleSizeGroupBox.sizer.add(this.sampleSize_Control);
    if (EXTRA_CONTROLS){
        this.maxSamples_Control = new NumericEdit(this);
        this.maxSamples_Control.real = false;
        this.maxSamples_Control.label.text = "Max samples:";
        this.maxSamples_Control.toolTip =
            "<p>Limits the number of samples used to create the surface spline. " +
            "If the number of samples exceed this limit, they are combined " +
            "(binned) to create super samples.</p>" +
            "<p>Increase if the overlap region is very large. " +
            "A larger number of samples increases the " +
            "theoretical maximum resolution of the surface spline. However, " +
            "small unbinned samples are noisier and require more smoothing. " +
            "The default value is usually a good compromise.</p>" +
            "<p>The time required to initialize the surface spline approximately " +
            "doubles every 1300 samples.</p>";
        this.maxSamples_Control.setRange(2000, 5000);
        this.maxSamples_Control.setValue(data.maxSamples);
        this.maxSamples_Control.enabled = false;

        let displayBinnedSamplesButton = new PushButton(this);
        displayBinnedSamplesButton.text = "Binned grid ";
        displayBinnedSamplesButton.toolTip =
                "<p>Displays the binned samples used to construct the surface spline " +
                "that models the relative gradient between the reference and target images.</p>" +
                "<p>Samples are binned to improve performance if the number of " +
                "samples exceed the specified limit.</p>" +
                "<p>The area of each binned sample represents the number of samples " +
                "it was created from.</p>" +
                "<p>Each binned sample's center is calculated from " +
                "the center of mass of the samples it was created from.</p>" +
                "<p>To see which of the unbinned samples were rejected due to stars, " +
                "use 'Sample grid'.</p>";
        displayBinnedSamplesButton.onClick = function () {
            data.viewFlag = DISPLAY_BINNED_SAMPLES();
            this.dialog.ok();
        };
        sampleSizeGroupBox.sizer.add(this.maxSamples_Control);
        sampleSizeGroupBox.sizer.add(displayBinnedSamplesButton);
    }
    sampleSizeGroupBox.sizer.addStretch();
    
    let displaySamplesButton = new PushButton(this);
    displaySamplesButton.text = "Sample generation";
    displaySamplesButton.toolTip =
            "<p>Displays the generated samples, the stars used to reject samples, " +
            "and the location of the join between the reference and target images. " +
            "Provides edit sliders for all 'Sample Generation' section parameters.</p>" +
            "<p>Samples are rejected if they: " +
            "<ul><li>Contain too many zero pixels in either image.</li>" +
            "<li>Are too close to a star included in the 'Limit stars %' range.</li></ul>" +
            "The surviving samples are drawn as squares. The stars used to " +
            "reject samples are indicated by circles.</p>" +
            "<p>Two surface splines are constructed from the generated samples:" +
            "<ul><li><b>Overlap model</b>, used to correct the overlap area.</li>" +
            "<li><b>Target model</b>, used to correct the rest of the target image.</li></ul></p>";
    displaySamplesButton.onClick = function () {
        data.viewFlag = DISPLAY_GRADIENT_SAMPLES();
        this.dialog.ok();
    };
    
    let editDisplayGroupBox = new GroupBox(this);
    editDisplayGroupBox.title = "Edit / Display";
    editDisplayGroupBox.sizer = new HorizontalSizer();
    editDisplayGroupBox.sizer.margin = 2;
    editDisplayGroupBox.sizer.addSpacing(2);
    editDisplayGroupBox.sizer.add(displaySamplesButton);
    editDisplayGroupBox.sizer.addSpacing(2);
    
    let generateSamplesHorizSizer = new HorizontalSizer();
    generateSamplesHorizSizer.spacing = 12;
    generateSamplesHorizSizer.add(filterSampleStarsGroupBox);
    generateSamplesHorizSizer.add(sampleSizeGroupBox);
    generateSamplesHorizSizer.add(sampleAutoGroupBox);
    generateSamplesHorizSizer.add(editDisplayGroupBox);
    
    let sampleGenerationSection = new Control(this);
    sampleGenerationSection.sizer = new VerticalSizer;
    sampleGenerationSection.sizer.spacing = 4;
    sampleGenerationSection.sizer.add(sampleStarRejectRadiusSizer);
    sampleGenerationSection.sizer.add(generateSamplesHorizSizer);
    let sampleGenerationBar = new SectionBar(this, "Sample Generation");
    sampleGenerationBar.setSection(sampleGenerationSection);
    sampleGenerationBar.onToggleSection = this.onToggleSection;
    sampleGenerationBar.toolTip = 
            "<p>This section generates samples used to model " +
            "the relative gradient between the reference and target images.</p>" +
            "<p>The overlap region is divided up into a grid of sample squares. " +
            "A sample's value is the median of the pixels it contains.</p>" +
            "<p>Samples are rejected if they contain one or more zero pixels in " +
            "either image or if they are too close to a bright star.</p>" +
            "<p>Two surface splines are constructed from the generated samples:" +
            "<ul><li><b>Overlap model</b>, used to correct the overlap area.</li>" +
            "<li><b>Target model</b>, used to correct the rest of the target image.</li></ul></p>";
    
    this.setSampleGenerationAutoValues = function (checked){
        data.useAutoSampleGeneration = checked;
        self.autoSampleGenerationCheckBox.checked = data.useAutoSampleGeneration;
        self.sampleStarGrowthRate_Control.enabled = !checked;
        self.sampleStarGrowthRateTarget_Control.enabled = !checked;
        self.limitSampleStarsPercent_Control.enabled = !checked;
        self.sampleSize_Control.enabled = !checked;
        if (checked){
            self.setSampleSizeAutoValue();
            self.setLimitSampleStarsPercentAutoValue(false);
            self.setSampleStarGrowthRateAutoValue(false);
            self.setSampleStarGrowthRateTargetAutoValue(false);
        }
    };
    this.setSampleSizeAutoValue = function(){
        if (data.useAutoSampleGeneration){
            let pixelAngle = calcDegreesPerPixel(data.pixelSize, data.focalLength);
            // Make sure we sample at least 100 x 100 microns on the sensor
            let minSampleSize = Math.round(100 / data.pixelSize);
            minSampleSize = Math.max(minSampleSize, self.sampleSize_Control.lowerBound);
            // 0.005 deg = 18 arcsec (18 >> than than 4 arcsecond seeing)
            let size = Math.max(minSampleSize, Math.round(0.005 / pixelAngle));
            size = Math.min(size, self.sampleSize_Control.upperBound);
            data.sampleSize = size;
            self.sampleSize_Control.setValue(data.sampleSize);
        } 
    };
    /**
     * @param {Boolean} calculate If true, force calculation. If false, only set auto value if cached data is available.
     */
    this.setLimitSampleStarsPercentAutoValue = function(calculate){
        if (data.useAutoSampleGeneration){
            let starCount = data.cache.getStarCountInsideOverlap(calculate);
            if (starCount !== undefined){
                let sampleGrid = data.cache.getSampleGrid(data);
                let binCount = sampleGrid.getBinCount();
                let nStars = binCount / 10;
                data.limitSampleStarsPercent = Math.min(100, Math.round(10000 * nStars / starCount) / 100);
                self.limitSampleStarsPercent_Control.setValue(data.limitSampleStarsPercent);
            }
        }
    };
    /**
     * @param {Boolean} calculate If true, force calculation. If false, only set auto value if cached data is available.
     */
    this.setSampleStarGrowthRateAutoValue = function(calculate){
        if (data.useAutoSampleGeneration){
            let maxStarFlux = data.cache.getMaxStarFlux(calculate);
            let limit = Math.round(calcDefaultGrowthLimit(data));
            limit = Math.max(limit, 2);
            data.sampleStarGrowthRate = calcStarGrowthRate(maxStarFlux, APERTURE_GROWTH_OVERLAP, limit);
            self.sampleStarGrowthRate_Control.setValue(data.sampleStarGrowthRate);
        }
    };
    /**
     * @param {Boolean} calculate If true, force calculation. If false, only set auto value if cached data is available.
     */
    this.setSampleStarGrowthRateTargetAutoValue = function(calculate){
        if (data.useAutoSampleGeneration){
            let maxStarFlux = data.cache.getMaxStarFlux(calculate); 
            let limit = Math.round(calcDefaultTargetGrowthLimit(data));
            limit = Math.max(limit, 15);   
            data.sampleStarGrowthRateTarget = calcStarGrowthRate(maxStarFlux, APERTURE_GROWTH_TARGET, limit);
            self.sampleStarGrowthRateTarget_Control.setValue(data.sampleStarGrowthRateTarget);
        }
    };
    this.setSampleGenerationAutoValues(data.useAutoSampleGeneration);
    
    // SectionBar: "Gradient Sample Generation" End

    // =======================================
    // SectionBar: "Adjust Scale"
    // =======================================
    let adjustScaleControls = new AdjustScaleControls();
    this.adjustRedScale_Control = adjustScaleControls.createAdjustRedEdit(this, data);
    this.adjustRedScale_Control.onValueUpdated = function (value){
        data.adjustScale[0] = value;
    };
    let adjustRedScaleReset_Control = adjustScaleControls.createScaleResetControl(this);
    adjustRedScaleReset_Control.onClick = function(){
        data.adjustScale[0] = 1;
        self.adjustRedScale_Control.setValue(data.adjustScale[0]);
    };
    
    this.adjustGreenScale_Control = adjustScaleControls.createAdjustGreenEdit(this, data);
    this.adjustGreenScale_Control.onValueUpdated = function (value){
        data.adjustScale[1] = value;
    };
    let adjustGreenScaleReset_Control = adjustScaleControls.createScaleResetControl(this);
    adjustGreenScaleReset_Control.onClick = function(){
        data.adjustScale[1] = 1;
        self.adjustGreenScale_Control.setValue(data.adjustScale[1]);
    };
    
    this.adjustBlueScale_Control = adjustScaleControls.createAdjustBlueEdit(this, data);
    this.adjustBlueScale_Control.onValueUpdated = function (value){
        data.adjustScale[2] = value;
    };
    let adjustBlueScaleReset_Control = adjustScaleControls.createScaleResetControl(this);
    adjustBlueScaleReset_Control.onClick = function(){
        data.adjustScale[2] = 1;
        self.adjustBlueScale_Control.setValue(data.adjustScale[2]);
    };
    
    let adjustScaleHelp = "<p>If the gradient has peaks or troughs that follow the intensity " +
        "variations over nebulae or galaxies (ignore any due to stars), this may indicate a scale error.</p>" +
        "<p>The <b>Adjust Scale</b> dialog can be used to fine tune the scale factor(s):</p>" +
        "<ul><li>Check <b>Gradient Path</b> to display the overlap image. " +
        "Adjust <b>Position(+/-)</b> so that the gradient path (green line) traverses bright and dark areas.<\li>" +
        "<li>Check <b>Adjust Scale</b> to display the graph. Adjust the scale until " +
        "any peak or trough that corresponds to a bright area " +
        "disappears into the gradient trend.<\li></ul>";
    let adjustScaleButton = new PushButton(this);
    adjustScaleButton.text = "Adjust scale";
    adjustScaleButton.toolTip = adjustScaleHelp;
    adjustScaleButton.onClick = function () {
        data.viewFlag = DISPLAY_SCALE_DIALOG();
        this.dialog.ok();
    };
    
    this.resetAdjustScaleControls = function(){
        data.adjustScale[0] = 1;
        data.adjustScale[1] = 1;
        data.adjustScale[2] = 1;
        data.adjustScaleLineOffset = 0;
        self.adjustRedScale_Control.setValue(data.adjustScale[0]);
        self.adjustGreenScale_Control.setValue(data.adjustScale[1]);
        self.adjustBlueScale_Control.setValue(data.adjustScale[2]);
    };
    this.enableAdjustScaleControls = function(isColor){
        self.adjustGreenScale_Control.enabled = isColor;
        self.adjustBlueScale_Control.enabled = isColor;
    };
    this.enableAdjustScaleControls(data.cache.isColor());
    
    let adjustScaleGroupBox = new GroupBox(this);
    adjustScaleGroupBox.title = "Scale multipliers";
    adjustScaleGroupBox.sizer = new HorizontalSizer();
    adjustScaleGroupBox.sizer.margin = 2;
    adjustScaleGroupBox.sizer.spacing = 2;
    adjustScaleGroupBox.sizer.add(this.adjustRedScale_Control);
    adjustScaleGroupBox.sizer.add(adjustRedScaleReset_Control);
    adjustScaleGroupBox.sizer.addSpacing(18);
    adjustScaleGroupBox.sizer.add(this.adjustGreenScale_Control);
    adjustScaleGroupBox.sizer.add(adjustGreenScaleReset_Control);
    adjustScaleGroupBox.sizer.addSpacing(18);
    adjustScaleGroupBox.sizer.add(this.adjustBlueScale_Control);
    adjustScaleGroupBox.sizer.add(adjustBlueScaleReset_Control);
    adjustScaleGroupBox.sizer.addStretch();
    adjustScaleGroupBox.sizer.add(adjustScaleButton);
    adjustScaleGroupBox.sizer.addSpacing(2);
    
    let scaleSection = new Control(this);
    scaleSection.sizer = new HorizontalSizer;
    scaleSection.sizer.spacing = 10;
    scaleSection.sizer.add(adjustScaleGroupBox);
    let scaleBar = new SectionBar(this, "Adjust Scale");
    scaleBar.setSection(scaleSection);
    scaleBar.onToggleSection = this.onToggleSection;
    scaleBar.toolTip = adjustScaleHelp;
    // SectionBar "Adjust Scale" End

    // ===============================================================
    // SectionBar: "Gradient Correction" : Group box "Overlap region"
    // ===============================================================
    // Gradient controls
    let GRADIENT_LABEL_LEN = this.font.width("Taper length:");
    let gradientControls = new GradientControls();
    this.overlapGradientSmoothness_Control = 
            gradientControls.createOverlapGradientSmoothnessEdit(this, data);
    this.overlapGradientSmoothness_Control.onValueUpdated = function (value) {
        data.overlapGradientSmoothness = value;
    };
    
    let overlapGradientSmoothnessReset_Control = gradientControls.createSmoothnessResetControl(this);
    overlapGradientSmoothnessReset_Control.onClick = function(){
        data.overlapGradientSmoothness = DEFAULT_OVERLAP_GRADIENT_SMOOTHNESS;
        self.overlapGradientSmoothness_Control.setValue(data.overlapGradientSmoothness);
    };
    
    let overlapGradientGraphButton = new PushButton(this);
    overlapGradientGraphButton.text = "Overlap gradient";
    overlapGradientGraphButton.toolTip =
        "<p>Edit the 'Smoothness' parameter and view the gradient along the join.</p>" +
        "<p>The vertical axis represents the difference between the two images, " +
        "the horizontal axis the join's X-Coordinate (horizontal join) " +
        "or Y-Coordinate (vertical join).</p>" +
        "<p>The data points represent samples close to the join's path. " +
        "The curve indicates the gradient along the join.</p>";
    overlapGradientGraphButton.onClick = function () {
        data.viewFlag = DISPLAY_OVERLAP_GRADIENT_GRAPH();
        this.dialog.ok();
    };
    
    let gradientOverlapGroupBox = new GroupBox(this);
    gradientOverlapGroupBox.title = "Overlap region";
    gradientOverlapGroupBox.sizer = new HorizontalSizer();
    gradientOverlapGroupBox.sizer.margin = 2;
    gradientOverlapGroupBox.sizer.spacing = 2;
    gradientOverlapGroupBox.sizer.add(this.overlapGradientSmoothness_Control, 100);
    gradientOverlapGroupBox.sizer.add(overlapGradientSmoothnessReset_Control, 0);
    gradientOverlapGroupBox.sizer.addStretch();
    gradientOverlapGroupBox.sizer.add(overlapGradientGraphButton);
    gradientOverlapGroupBox.sizer.addSpacing(2);
    
    // =============================================================
    // SectionBar: "Gradient Correction" : Group box "Target Image"
    // =============================================================
    this.targetGradientSmoothness_Control = 
            gradientControls.createTargetGradientSmoothnessEdit(this, data);
    this.targetGradientSmoothness_Control.onValueUpdated = function (value) {
        data.targetGradientSmoothness = value;
    };
    
    let targetGradientSmoothnessReset_Control = gradientControls.createSmoothnessResetControl(this);
    targetGradientSmoothnessReset_Control.onClick = function(){
        data.targetGradientSmoothness = DEFAULT_TARGET_GRADIENT_SMOOTHNESS;
        self.targetGradientSmoothness_Control.setValue(data.targetGradientSmoothness);
    };
    
    let targetGradientGraphButton = new PushButton(this);
    targetGradientGraphButton.text = "Target gradient";
    targetGradientGraphButton.toolTip =
        "<p>Edit the 'Smoothness' parameter and view the gradient that will be " +
        "applied to the rest of the target image (i.e. outside the overlap region).</p>" +
        "<p>The vertical axis represents the difference between the two images, " +
        "the horizontal axis the join's X-Coordinate (horizontal join) " +
        "or Y-Coordinate (vertical join).</p>" +
        "<p>The data points represent samples close to the join's path.</p>" +
        "<p>The curve indicates the gradient correction that will be applied to the " +
        "target image area that's outside the overlap region.</p>";
    targetGradientGraphButton.onClick = function () {
        data.viewFlag = DISPLAY_TARGET_GRADIENT_GRAPH();
        this.dialog.ok();
    };
    
    this.setTargetGradientFlag = function (checked){
        data.useTargetGradientCorrection = checked;
        self.gradientTargetImageGroupBox.checked = checked;
        self.targetGradientSmoothness_Control.enabled = checked;
        targetGradientGraphButton.enabled = checked;
        self.setTaperLengthAutoValue(data);
    };
    
    this.gradientTargetImageGroupBox = new GroupBox(this);
    this.gradientTargetImageGroupBox.title = "Target image";
    this.gradientTargetImageGroupBox.titleCheckBox = true;
    this.gradientTargetImageGroupBox.onCheck = this.setTargetGradientFlag;
    this.gradientTargetImageGroupBox.sizer = new HorizontalSizer();
    this.gradientTargetImageGroupBox.sizer.margin = 2;
    this.gradientTargetImageGroupBox.sizer.spacing = 2;
    this.gradientTargetImageGroupBox.sizer.add(this.targetGradientSmoothness_Control, 100);
    this.gradientTargetImageGroupBox.sizer.add(targetGradientSmoothnessReset_Control, 0);
    this.gradientTargetImageGroupBox.sizer.addStretch();
    this.gradientTargetImageGroupBox.sizer.add(targetGradientGraphButton);
    this.gradientTargetImageGroupBox.sizer.addSpacing(2);
    this.gradientTargetImageGroupBox.toolTip = 
            "<p>If selected, a gradient correction is applied " +
            "to the rest of the target image (i.e. outside the overlap region).</p>" +
            "<p>If not selected, only the average relative offset is applied.</p>" +
            "<p>In most situations, this option should be selected.</p>";
    
    let gradientsHorizSizer = new HorizontalSizer();
    gradientsHorizSizer.spacing = 12;
    gradientsHorizSizer.add(gradientOverlapGroupBox, 50);
    gradientsHorizSizer.add(this.gradientTargetImageGroupBox, 50);
    
    // ========================================================================================
    // SectionBar: "Gradient Correction" : Group box "Overlap to Target transition"
    // ========================================================================================
    let taperTooltip = "<p>The taper length should be a similar size to the scale of " +
        "local gradients - i.e. how far scattered light extends around bright stars.</p>" +
        "<p>The gradient within the overlap region can be accurately " +
        "calculated, and only requires a small amount of smoothing to remove noise.</p>" +
        "<p>The gradient applied to the rest of the target frame is based on the " +
        "gradient at the join. Local variations in the " +
        "gradient need to be filtered out by rejecting more samples around bright stars, " +
        "and by applying more smoothing.</p>" +
        "<p>The taper length provides a tapered transition between these two regions. " +
        "This transition zone starts at the join and extends for 'Taper length' on the join's target side.</p>";
    
    this.taperLength_Control = new NumericControl(this);
    this.taperLength_Control.real = false;
    this.taperLength_Control.label.text = "Taper length:";
    this.taperLength_Control.label.minWidth = GRADIENT_LABEL_LEN;
    this.taperLength_Control.toolTip = taperTooltip;
    this.taperLength_Control.onValueUpdated = function (value) {
        data.taperLength = value;
    };
    this.taperLength_Control.setRange(0, 2000);
    this.taperLength_Control.slider.setRange(0, 400);
    this.taperLength_Control.slider.minWidth = 500;
    this.taperLength_Control.setValue(data.taperLength);
    
    this.autoTaperLengthCheckBox = new CheckBox(this);
    this.autoTaperLengthCheckBox.text = "Auto";
    this.autoTaperLengthCheckBox.toolTip = "<p>Automatically determine the taper length.</p>" +
            "<p>The calculation uses the header entries " +
            "'<b>XPIXSZ</b>' (pixel size in microns) and " +
            "'<b>FOCALLEN</b>' (focal length in mm)</p>";
    this.autoTaperLengthCheckBox.onCheck = function (checked){
        data.useAutoTaperLength = checked;
        self.setTaperLengthAutoValue(data);
    };
    this.autoTaperLengthCheckBox.checked = data.useAutoTaperLength;
    
    this.setTaperLengthAutoValue = function(data){
        if (data.useAutoTaperLength){
            let taperLength;
            if (data.useTargetGradientCorrection){
                taperLength = Math.max(10, Math.round(calcDefaultTargetGrowthLimit(data) / 2.0));
            } else {
                // No target image gradient correction. This requires a longer tager
                taperLength = 1000;
            }
            taperLength = Math.min(taperLength, self.taperLength_Control.upperBound);
            data.taperLength = taperLength;
            self.taperLength_Control.setValue(data.taperLength);
        }
        self.taperLength_Control.enabled = !data.useAutoTaperLength;
    };
    
    let gradientTaperGroupBox = new GroupBox(this);
    gradientTaperGroupBox.title = "Overlap to Target transition";
    gradientTaperGroupBox.sizer = new HorizontalSizer();
    gradientTaperGroupBox.sizer.margin = 2;
    gradientTaperGroupBox.sizer.add(this.taperLength_Control);
    gradientTaperGroupBox.sizer.addSpacing(20);
    gradientTaperGroupBox.sizer.add(this.autoTaperLengthCheckBox);
    gradientTaperGroupBox.toolTip = taperTooltip;
    
    let gradientSection = new Control(this);
    gradientSection.sizer = new VerticalSizer(this);
    gradientSection.sizer.spacing = 4;
    gradientSection.sizer.add(gradientsHorizSizer);
    gradientSection.sizer.add(gradientTaperGroupBox);
    let gradientBar = new SectionBar(this, "Gradient Correction");
    gradientBar.setSection(gradientSection);
    gradientBar.onToggleSection = this.onToggleSection;
//    gradientBar.toolTip = "<p></p>";

    this.setTargetGradientFlag(data.useTargetGradientCorrection);
    // SectionBar: "Gradient Correction" End

    let joinButton = new PushButton(this);
    joinButton.text = "Adjust join";
    joinButton.toolTip =
            "<p>Displays the 'Join Size and Position' dialog.</p>" +
            "<p>This displays the overlap region. " +
            "The green line (Overlay mode) shows the path of the mosaic join. " +
            "The green rectangle (Blend or Average mode) shows the Join Region.</p>" +
            "<p>The region on the reference side of the green line/rectangle " +
            "will be replaced by reference pixels. The other side of the green line/rectangle will " +
            "taper down to the smoother target image correction.</p>";
    joinButton.onClick = function () {
        data.viewFlag = DISPLAY_JOIN_REGION();
        this.dialog.ok();
    };


    // ===========================================
    // SectionBar: Replace/Update Region
    // GroupBox Join Region (From Preview)
    // ===========================================
    const getAreaFromPreviewStr = "From preview:";
    const GET_AREA_FROM_PREVIEW_STRLEN = this.font.width(getAreaFromPreviewStr);
    const replaceUpdateRegionTooltip =
            "<p>This section is used to replace data inside the reference image " +
            "(in this case the reference image is usually a completed mosaic).</p>" +
            "<p>For example, areas close to image corners that had poor resolution " +
            "can be replaced.</p>";
    
    /**
     * 
     * @param {String} label
     * @param {String} tooltip
     * @param {Number} initialValue
     * @param {Number} editWidth
     * @returns {NumericEdit}
     */
    function createPreviewNumericEdit(label, tooltip, initialValue, editWidth) {
        let control = new NumericEdit();
        control.setReal(false);
        control.setRange(0, 1000000000);
        control.setValue(initialValue);
        control.label.text = label;
        control.label.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
        control.toolTip = tooltip;
        return control;
    }
    
    let x0ToolTip = "X-coordinate of region's top left corner";
    this.rectangleX0_Control = createPreviewNumericEdit("Left:", x0ToolTip,
            data.cropTargetPreviewRect.x0, 50);
    this.rectangleX0_Control.label.setFixedWidth(
            this.font.width("Left:") + GET_AREA_FROM_PREVIEW_STRLEN + 4);
    this.rectangleX0_Control.onValueUpdated = function (value){
        data.cropTargetPreviewRect = getCropTargetPreviewRect();
    };
    let y0ToolTip = "Y-coordinate of region's top left corner";
    this.rectangleY0_Control = createPreviewNumericEdit("Top:", y0ToolTip,
            data.cropTargetPreviewRect.y0, 50);
    this.rectangleY0_Control.onValueUpdated = function (value){
        data.cropTargetPreviewRect = getCropTargetPreviewRect();
    };
    this.rectangleWidth_Control = createPreviewNumericEdit("Width:", "Region's width",
            data.cropTargetPreviewRect.width, 50);
    this.rectangleWidth_Control.onValueUpdated = function (value){
        data.cropTargetPreviewRect = getCropTargetPreviewRect();
    };
    this.rectangleHeight_Control = createPreviewNumericEdit("Height:", "Region's height",
            data.cropTargetPreviewRect.height, 50);
    this.rectangleHeight_Control.onValueUpdated = function (value){
        data.cropTargetPreviewRect = getCropTargetPreviewRect();
    };
    
    function getCropTargetPreviewRect(){
        let x = self.rectangleX0_Control.value;
        let y = self.rectangleY0_Control.value;
        let w = self.rectangleWidth_Control.value;
        let h = self.rectangleHeight_Control.value;
        return new Rect(x, y, x + w, y + h);
    }
    
    /**
     * Sets data.cropTargetPreviewRect and updates the Replace/Update Region text boxes.
     * @param {Rect} rect
     */
    this.setCropTargetPreviewRect = function(rect){
        data.cropTargetPreviewRect = rect;
        self.rectangleX0_Control.setValue(rect.x0);
        self.rectangleY0_Control.setValue(rect.y0);
        self.rectangleWidth_Control.setValue(rect.width);
        self.rectangleHeight_Control.setValue(rect.height);
    };

    let cropTargetHorizSizer1 = new HorizontalSizer(this); 
    cropTargetHorizSizer1.spacing = 10;
    cropTargetHorizSizer1.add(this.rectangleX0_Control);
    cropTargetHorizSizer1.add(this.rectangleY0_Control);
    cropTargetHorizSizer1.add(this.rectangleWidth_Control);
    cropTargetHorizSizer1.add(this.rectangleHeight_Control);
    cropTargetHorizSizer1.addStretch();

    function previewUpdateActions(){
        let view = self.previewImage_ViewList.currentView;
        if (view.isPreview) {
            self.setCropTargetPreviewRect(view.window.previewRect(view));
        }
    };

    // Get Area from preview
    let previewImage_Label = new Label(this);
    previewImage_Label.text = getAreaFromPreviewStr;
    previewImage_Label.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;

    this.previewImage_ViewList = new ViewList(this);
    this.previewImage_ViewList.getPreviews();
    this.previewImage_ViewList.minWidth = 300;
    this.previewImage_ViewList.toolTip = "<p>Get the area of the mosaic to be replaced from a preview.</p>";
    this.previewImage_ViewList.onViewSelected = function (view) {
        previewUpdateActions();
    };

    let previewUpdateButton = new PushButton(this);
    previewUpdateButton.hasFocus = false;
    previewUpdateButton.text = "Update";
    previewUpdateButton.toolTip = "<p>Reset the text boxes to the selected preview's coordinates.</p>";
    previewUpdateButton.onClick = function () {
        if (!this.isUnderMouse){
            // Ensure pressing return in a different field does not trigger this callback!
            return;
        }
        previewUpdateActions();
    };

    let cropTargetHorizSizer2 = new HorizontalSizer(this);
    cropTargetHorizSizer2.spacing = 4;
    cropTargetHorizSizer2.add(previewImage_Label);
    cropTargetHorizSizer2.add(this.previewImage_ViewList, 100);
    cropTargetHorizSizer2.addSpacing(10);
    cropTargetHorizSizer2.add(previewUpdateButton);
    
    /**
     * Enable/Disable controls affected by Replace/Update region.
     * Sets the 'Replace/Update region' checkbox and 'Target image gradient smoothness' group checkbox.
     * @param {Boolean} checked Set Replace/Update Region checkbox & enable/disable
     */
    this.enableReplaceUpdateRegion = function(checked){
        replaceUpdateBar.checkBox.checked = checked;
        replaceUpdateSection.enabled = checked;
        data.useCropTargetToReplaceRegion = checked;
        enableJoinSizePositionControls();
        if (checked){
            self.mosaicOverlay_Control.checked = true;
            self.mosaicRandom_Control.checked = false;
            self.mosaicAverage_Control.checked = false;
            updateMosaicMode(true, false, false);
        }
        self.mosaicOverlay_Control.enabled = !checked;
        self.mosaicRandom_Control.enabled = !checked;
        self.mosaicAverage_Control.enabled = !checked;
        self.gradientTargetImageGroupBox.enabled = !checked;
        gradientTaperGroupBox.enabled = !checked;
    };
    
    this.cropTargetGroupBox = new GroupBox(this);
    this.cropTargetGroupBox.title = "Reference image area to be replaced";
    this.cropTargetGroupBox.toolTip = replaceUpdateRegionTooltip;
    this.cropTargetGroupBox.sizer = new VerticalSizer(this);
    this.cropTargetGroupBox.sizer.margin = 2;
    this.cropTargetGroupBox.sizer.spacing = 4;
    this.cropTargetGroupBox.sizer.add(cropTargetHorizSizer1);
    this.cropTargetGroupBox.sizer.add(cropTargetHorizSizer2);
    // GroupBox "Join Region (User defined)" End
    
    let replaceUpdateSection = new Control(this);
    replaceUpdateSection.sizer = new VerticalSizer;
    replaceUpdateSection.sizer.spacing = 4;
    replaceUpdateSection.sizer.add(this.cropTargetGroupBox);
    let replaceUpdateBar = new SectionBar(this, "Replace Region");
    replaceUpdateBar.enableCheckBox();
    replaceUpdateBar.checkBox.onCheck = this.enableReplaceUpdateRegion;
    replaceUpdateBar.setSection(replaceUpdateSection);
    replaceUpdateBar.onToggleSection = this.onToggleSection;
    replaceUpdateBar.toolTip = replaceUpdateRegionTooltip;
    // SectionBar "Join Region" End


    // =======================================
    // SectionBar: "Mosaic Join"
    // =======================================
    
    // =============================
    // GroupBox: "Combination mode"
    // =============================
    this.mosaicOverlay_Control = new RadioButton(this);
    this.mosaicOverlay_Control.text = "Overlay";
    this.mosaicOverlay_Control.toolTip =
        "<p>The 'Overlay' mode is ideal if the reference and target images have a similar signal to noise ratio.</p>" + 
        "<p>Reference pixels are drawn on top of target pixels on the reference side of the join.</p>" +
        "<p>On the other side of the join, the detailed correction over the overlap is " +
        "tapered down to the smoother correction applied to the rest of the target image.</p>" +
        "<p>Use the 'Join' button to view and adjust the position of the join. " +
        "Try to keep it within the sample grid area and, if possible, " +
        "avoid image corners, bright stars and contrasty areas.</p>";
    this.mosaicOverlay_Control.checked = data.useMosaicOverlay;
    this.mosaicOverlay_Control.onClick = function (checked) {
        if (checked)
            updateMosaicMode(true, false, false);
    };

    this.mosaicRandom_Control = new RadioButton(this);
    this.mosaicRandom_Control.text = "Blend";
    this.mosaicRandom_Control.toolTip = 
        "<p>Use this mode to dissolve the target image into the reference. " +
        "This is particularly useful if the two images have very different signal to noise ratios.</p>" + 
        "<p>On the reference side of the join, between the two green lines, " +
        "pixels are randomly chosen from the " +
        "reference and target images. The contribution from the target image is " +
        "tapered from 0% at the reference side to 100% at the target side.</p>" +
        "<p>Use the 'Join' button to view and adjust the " +
        "size and position of this Join Region.</p>" +
        "<p>The bright green line indicates the join position. " +
        "Try to keep it within the sample grid area and, if possible, " +
        "avoid image corners, bright stars and contrasty areas.</p>";
    this.mosaicRandom_Control.checked = data.useMosaicRandom;
    this.mosaicRandom_Control.onClick = function (checked) {
        if (checked)
            updateMosaicMode(false, true, false);
    };
    
    this.mosaicAverage_Control = new RadioButton(this);
    this.mosaicAverage_Control.text = "Average";
    this.mosaicAverage_Control.toolTip = 
        "<p>Use this mode to seamlessly blend the two sides of the join. " +
        "This is particularly useful if the two images have very different signal to noise ratios.</p>" + 
        "<p>On the reference side of the join, between the two green lines, " +
        "the pixels are a weighted average of the reference and target pixels. " +
        "The weights taper across the join region, from 100% target at the " +
        "target side to 100% reference at the reference side. " +
        "At the centre, each provides a 50% contribution, which improves " +
        "the signal to noise ratio (which may or may not be desirable).</p>" +
        "<p>Use the 'Join' button to view and adjust the " +
        "size and position of this Join Region.</p>" +
        "<p>The bright green line indicates the join position. " +
        "Try to keep it within the sample grid area and, if possible, " +
        "avoid image corners, bright stars and contrasty areas.</p>";
    this.mosaicAverage_Control.checked = data.useMosaicAverage;
    this.mosaicAverage_Control.onClick = function (checked) {
        if (checked)
            updateMosaicMode(false, false, true);
    };
    
    let mosaicCombinationModeGroupBox = new GroupBox(this);
    mosaicCombinationModeGroupBox.title = "Combination mode";
    mosaicCombinationModeGroupBox.sizer = new HorizontalSizer();
    mosaicCombinationModeGroupBox.sizer.margin = 2;
    mosaicCombinationModeGroupBox.sizer.spacing = 10;
    mosaicCombinationModeGroupBox.sizer.addSpacing(2);
    mosaicCombinationModeGroupBox.sizer.add(this.mosaicOverlay_Control);
    mosaicCombinationModeGroupBox.sizer.add(this.mosaicRandom_Control);
    mosaicCombinationModeGroupBox.sizer.add(this.mosaicAverage_Control);
    mosaicCombinationModeGroupBox.sizer.addSpacing(2);
    mosaicCombinationModeGroupBox.toolTip = "<p>Mosaic combination mode:</p>" +
            "<ul><li><b>Overlay</b>: Ideal if the reference and target images have a similar signal to noise ratio.</li>" +
            "<li><b>Blend</b>: Excellent at blending the two sides of the join. " +
            "This is particularly useful if the two images have very different signal to noise ratios.</li>" +
            "<li><b>Average</b>: Increases the signal to noise ratio over the join, " +
            "although this can also make the join more visible.</li></ul>";
    
    // =======================================
    // GroupBox: "Join"
    // =======================================
    this.joinPosition_Control = sampleControls.createJoinPositionEdit(this, data);
    this.joinPosition_Control.onValueUpdated = function (value){
        data.joinPosition = value;
    };
    
    let joinPositionResetControl = sampleControls.createJoinPositionResetControl(this);
    joinPositionResetControl.onClick = function(){
        self.setJoinPosition(0);
    };
    
    this.setJoinPosition = function(value){
        data.joinPosition = value;
        self.joinPosition_Control.setValue(data.joinPosition);
    };

    this.joinSize_Control = sampleControls.createJoinSizeEdit(this, data);
    this.joinSize_Control.onValueUpdated = function (value) {
        data.joinSize = value;
    };
    
    let joinSizeResetControl = sampleControls.createJoinSizeResetControl(this);
    joinSizeResetControl.onClick = function(){
        data.joinSize = DEFAULT_JOIN_SIZE;
        self.joinSize_Control.setValue(data.joinSize);
    };
    
    this.joinMask_CheckBox = new CheckBox(this);
    this.joinMask_CheckBox.text = "Mask";
    this.joinMask_CheckBox.toolTip =
            "<p>Create a mask of the join. Apply this to the mosaic to see " +
            "where the join is. Use <b>Ctrl K</b> to show/hide the mask " +
            "to judge the join's quality.</p>" + 
            "<p><u>Mosaic Join Mode: Overlay</u><br />" +
            "The mask is a line that indicates the path of the join.</p>" +
            "<p><u>Mosaic Join Mode: Blend or Average</u><br />" +
            "The mask reveals the Join Region. Within this area the " +
            "mosaic pixels were either randomly chosen from the reference " +
            "and target image, or averaged.</p>";
    this.joinMask_CheckBox.onCheck = function (checked) {
        data.createJoinMask = checked;
    };
    this.joinMask_CheckBox.checked = data.createJoinMask;
    
    let joinSizeGroupBox = new GroupBox(this);
    joinSizeGroupBox.title = "Join";
    joinSizeGroupBox.sizer = new HorizontalSizer;
    joinSizeGroupBox.sizer.margin = 2;
    joinSizeGroupBox.sizer.spacing = 2;
    joinSizeGroupBox.sizer.addSpacing(8);
    joinSizeGroupBox.sizer.add(this.joinPosition_Control);
    joinSizeGroupBox.sizer.add(joinPositionResetControl);
    joinSizeGroupBox.sizer.addSpacing(18);
    joinSizeGroupBox.sizer.add(this.joinSize_Control);
    joinSizeGroupBox.sizer.add(joinSizeResetControl);
    joinSizeGroupBox.sizer.addStretch();
    joinSizeGroupBox.sizer.add(this.joinMask_CheckBox);
    joinSizeGroupBox.sizer.addSpacing(8);
    joinSizeGroupBox.sizer.add(joinButton);
    joinSizeGroupBox.sizer.addSpacing(2);
    
    this.joinOutlier_Control = new NumericControl(this);
    this.joinOutlier_Control.real = true;
    this.joinOutlier_Control.setPrecision(1);
    this.joinOutlier_Control.label = undefined;
    this.joinOutlier_Control.toolTip = 
        "<p>The Blend and Average modes can produce artifacts around stars. " +
        "This occurs if target and reference stars have different profiles, or " +
        "slightly different positions. In these cases, the Average algorithm can " +
        "result in bloated or 'double' stars. The Blend algorithm can produce " +
        "speckles around these stars.</p>" + 
        "<p>This control specifies the percentage of outlier pixels that these algorithms " +
        "should ignore. The higher the value, the less likely these artifacts become. " +
        "However, if the value is too high, the join will not blend as effectively.</p>" +
        "<p>The default of 2% usually works well, but some images may need much higher values.</p>";
    this.joinOutlier_Control.onValueUpdated = function (value) {
        data.joinOutlierPercent = value;
    };
    this.joinOutlier_Control.setRange(0, 20);
    this.joinOutlier_Control.slider.setRange(0, 20);
    this.joinOutlier_Control.slider.minWidth = 20;
    this.joinOutlier_Control.setValue(data.joinOutlierPercent);
    let joinOutlier_Reset = createResetControl(this, "<p>Reset outlier rejection to default.</p>");
    joinOutlier_Reset.onClick = function(){
        data.joinOutlierPercent = DEFAULT_OUTLIER_PERCENT;
        self.joinOutlier_Control.setValue(data.joinOutlierPercent);
    };

    let joinOutlierGroupBox = new GroupBox(this);
    joinOutlierGroupBox.title = "Outlier %";
    joinOutlierGroupBox.sizer = new HorizontalSizer;
    joinOutlierGroupBox.sizer.margin = 2;
    joinOutlierGroupBox.sizer.spacing = 2;
    joinOutlierGroupBox.sizer.add(this.joinOutlier_Control);
    joinOutlierGroupBox.sizer.add(joinOutlier_Reset);    
    
    this.joinOrientationAuto_Control = new RadioButton(this);
    this.joinOrientationAuto_Control.text = "Auto";
    this.joinOrientationAuto_Control.toolTip = 
        "<p>Automatically determines if the join line is horizontal or vertical, " +
        "based on the shape of the overlap.</p>" +
        "<p>For example, if the overlap area is taller than it's wide, it assumes " +
        "a vertical join line.</p>" +
        "<p>If the overlap is very large, this assumption may be incorrect. " +
        "You must then specify 'Horizontal' or 'Vertical'.</p>";
    this.joinOrientationAuto_Control.checked = data.useJoinOrientationAuto;
    this.joinOrientationAuto_Control.onClick = function (checked) {
        if (checked){
            self.setJoinPosition(0);
            updateJoinOrientation(true, false, false);
            setJoinPositionRange(self.joinPosition_Control, data, false);
        }
    };
    
    this.joinOrientationHorizontal_Control = new RadioButton(this);
    this.joinOrientationHorizontal_Control.text = "Horizontal";
    this.joinOrientationHorizontal_Control.toolTip = "<p>Specify that the join line is horizontal " +
            "(one of the mosaic tiles is above the other one)</p>";
    this.joinOrientationHorizontal_Control.checked = data.useJoinOrientationHorizontal;
    this.joinOrientationHorizontal_Control.onClick = function (checked) {
        if (checked){
            self.setJoinPosition(0);
            updateJoinOrientation(false, true, false);
            setJoinPositionRange(self.joinPosition_Control, data, false);
        }
    };
    
    this.joinOrientationVertical_Control = new RadioButton(this);
    this.joinOrientationVertical_Control.text = "Vertical";
    this.joinOrientationVertical_Control.toolTip = "<p>Specify that the join line is vertical " +
            "(one of the mosaic tiles is to the left the other one)</p>";
    this.joinOrientationVertical_Control.checked = data.useJoinOrientationVertical;
    this.joinOrientationVertical_Control.onClick = function (checked) {
        if (checked){
            self.setJoinPosition(0);
            updateJoinOrientation(false, false, true);
            setJoinPositionRange(self.joinPosition_Control, data, false);
        }
    };
    
    /**
     * @param {Boolean} isAuto
     * @param {Boolean} isHorizontal
     * @param {Boolean} isVertical
     */
    function updateJoinOrientation(isAuto, isHorizontal, isVertical){
        data.useJoinOrientationAuto = isAuto;
        data.useJoinOrientationHorizontal = isHorizontal;
        data.useJoinOrientationVertical = isVertical;
        self.joinOrientationAuto_Control.checked = data.useJoinOrientationAuto;
        self.joinOrientationHorizontal_Control.checked = data.useJoinOrientationHorizontal;
        self.joinOrientationVertical_Control.checked = data.useJoinOrientationVertical;
    }
    
    let joinOrientationGroupBox = new GroupBox(this);
    joinOrientationGroupBox.title = "Join Orientation";
    joinOrientationGroupBox.sizer = new HorizontalSizer();
    joinOrientationGroupBox.sizer.margin = 2;
    joinOrientationGroupBox.sizer.spacing = 10;
    joinOrientationGroupBox.sizer.addSpacing(2);
    joinOrientationGroupBox.sizer.add(this.joinOrientationHorizontal_Control);
    joinOrientationGroupBox.sizer.add(this.joinOrientationVertical_Control);
    joinOrientationGroupBox.sizer.add(this.joinOrientationAuto_Control);
    joinOrientationGroupBox.sizer.addSpacing(2);
    
    /**
     * Sets the boolean flags.
     * Enables/disables the Join Size control.
     * @param {Boolean} isOverlay
     * @param {Boolean} isRandom
     * @param {Boolean} isAverage
     */
    function updateMosaicMode(isOverlay, isRandom, isAverage){
        data.useMosaicOverlay = isOverlay;
        data.useMosaicRandom = isRandom;
        data.useMosaicAverage = isAverage;
        enableJoinSizePositionControls();
    }
    
    // this also calls enableJoinSizeControl()
    this.enableReplaceUpdateRegion(data.useCropTargetToReplaceRegion);
    
    function enableJoinSizePositionControls(){
        self.joinMask_CheckBox.enabled = !data.useCropTargetToReplaceRegion;
        self.joinPosition_Control.enabled = !data.useCropTargetToReplaceRegion;
        self.joinSize_Control.enabled = !data.useCropTargetToReplaceRegion && !data.useMosaicOverlay;
        self.joinOutlier_Control.enabled = !data.useMosaicOverlay;
    }
    
    let joinModeSizer = new HorizontalSizer(this);
    joinModeSizer.spacing = 10;
    joinModeSizer.add(mosaicCombinationModeGroupBox);
    joinModeSizer.add(joinOutlierGroupBox);
    
    let joinSizer = new HorizontalSizer(this);
    joinSizer.spacing = 10;
    joinSizer.add(joinOrientationGroupBox);
    joinSizer.add(joinSizeGroupBox);
    
    let mosaicSection = new Control(this);
    mosaicSection.sizer = new VerticalSizer(this);
    mosaicSection.sizer.spacing = 4;
    mosaicSection.sizer.add(joinModeSizer);
    mosaicSection.sizer.add(joinSizer);
    this.mosaicBar = new SectionBar(this, "Mosaic Join");
    this.mosaicBar.setSection(mosaicSection);
    this.mosaicBar.onToggleSection = this.onToggleSection;
    // SectionBar: "Create Mosaic" End
    
    const helpWindowTitle = TITLE() + " Help";
    const HELP_MSG = "<p>Failed to find help files</p>";
    
    let okTooltip = "<p>Create the mosaic using the specified combination mode.</p>";

    this.smallScreenToggle = new CheckBox(this);
    this.smallScreenToggle.text = "Small screen";
    this.smallScreenToggle.toolTip = "<p>Restrict dialog window heights to less than 900 pixels</p>";
    this.smallScreenToggle.onCheck = function (checked) {
        data.smallScreen = checked;
    };
    this.smallScreenToggle.checked = data.smallScreen;

    let buttons_Sizer = createWindowControlButtons(this.dialog, data, 
            helpWindowTitle, HELP_MSG, "PhotometricMosaic", okTooltip, this.smallScreenToggle);

    //---------------------------------------------------------------
    // Vertically stack all the SectionBars and OK/Cancel button bar
    //---------------------------------------------------------------
    this.sizer = new VerticalSizer(this);
    this.sizer.margin = 6;
    this.sizer.spacing = 4;
    this.sizer.add(titleBar);
    this.sizer.add(titleSection);
    this.sizer.add(selectViewBar);
    this.sizer.add(selectViewSection);
    this.sizer.add(starDetectionBar);
    this.sizer.add(starDetectionSection);
    this.sizer.add(photometrySearchBar);
    this.sizer.add(photometrySearchSection);
    this.sizer.add(photometryBar);
    this.sizer.add(photometrySection);
    this.sizer.add(replaceUpdateBar);
    this.sizer.add(replaceUpdateSection);
    this.sizer.add(this.mosaicBar);
    this.sizer.add(mosaicSection);
    this.sizer.add(sampleGenerationBar);
    this.sizer.add(sampleGenerationSection);
    this.sizer.add(scaleBar);
    this.sizer.add(scaleSection);
    this.sizer.add(gradientBar);
    this.sizer.add(gradientSection);
    this.sizer.addSpacing(5);
    this.sizer.add(buttons_Sizer);
    
    starDetectionSection.hide();
    photometrySearchSection.hide();
    if (data.useAutoPhotometry)
        photometrySection.hide();
    replaceUpdateSection.hide();
    if (data.useAutoSampleGeneration && data.manualRejectionCircles.length === 0)
        sampleGenerationSection.hide();

    //-------------------------------------------------------
    // Set all the window data
    //-------------------------------------------------------
    this.windowTitle = TITLE();
    this.adjustToContents();
    this.setFixedSize();
}

// Our dialog inherits all properties and methods from the core Dialog object.
}

// Photometric Mosaic main process
function main() {
    console.show();
    console.abortEnabled = false; // Allowing abort would complicate cache strategy
    console.noteln("\n\n=== <b>" + TITLE() + " ", VERSION(), "</b> ===");
    
    // Create dialog, start looping
    let data = new PhotometricMosaicData();

    if (Parameters.isViewTarget) {
        console.warningln("PhotometricMosaic cannot run as a background process. Starting user interface.");
        data.loadParameters();
        data.targetView = Parameters.targetView;
        if (data.targetView.isPreview){
            data.targetView = data.targetView.window.mainView;
        }
    } else if (Parameters.isGlobalTarget) {
        data.loadParameters();
    } else {
        restoreSettings(data);
    }

    let exception = null;
    let checkedRefViewId = "";
    let checkedTgtViewId = "";
    let photometricMosaicDialog = new PhotometricMosaicDialog(data);
    for (; ; ) {
        data.viewFlag = 0;
        if (!photometricMosaicDialog.execute())
            break;

        // User must select a reference and target view with the same dimensions and color depth
        if (data.targetView.isNull) {
            (new MessageBox("WARNING: Target view must be selected", TITLE(), StdIcon.Error, StdButton.Ok)).execute();
            continue;
        }
        if (data.referenceView.isNull) {
            (new MessageBox("WARNING: Reference view must be selected", TITLE(), StdIcon.Error, StdButton.Ok)).execute();
            continue;
        }
        if (data.targetView.image.isColor !== data.referenceView.image.isColor) {
            (new MessageBox("ERROR: Both images must have the same color depth", TITLE(), StdIcon.Error, StdButton.Ok)).execute();
            continue;
        }
        if (data.targetView.image.width !== data.referenceView.image.width ||
                data.targetView.image.height !== data.referenceView.image.height) {
            (new MessageBox("ERROR: Both images must have the same dimensions", TITLE(), StdIcon.Error, StdButton.Ok)).execute();
            continue;
        }
        if (data.useCropTargetToReplaceRegion){
            if (data.cropTargetPreviewRect.x1 > data.targetView.image.width || 
                    data.cropTargetPreviewRect.y1 > data.referenceView.image.height){
                (new MessageBox("ERROR: Join Region Preview extends beyond the edge of the image\n" +
                "Have you selected the wrong preview?", TITLE(), StdIcon.Error, StdButton.Ok)).execute();
                continue;
            }
        }
        if (data.targetView.fullId === data.referenceView.fullId) {
            (new MessageBox("ERROR: Target and Reference are set to the same view", TITLE(), StdIcon.Error, StdButton.Ok)).execute();
            continue;
        }
        if (!data.useCropTargetToReplaceRegion){
            let getTrimMessageBox = function(imageView){
                let imageName = imageView.fullId;
                let msg = "<p>Warning: '<b>" + imageName + "</b>' has not been trimmed by the <b>" + TRIM_NAME() + "</b> script.</p>" +
                        "<p><b>PhotometricMosaic</b> requires the images to have hard edges.<br>" +
                        "Registration and Image integration or color combination can produce regions with incomplete data. " +
                        "Soft edges can also be introduced by the MosaicByCoordinates script.</p>" +
                        "<p>A soft edge can produce fine lines, especially at the ends of the join." +
                        "<p>Use <b>" + TRIM_NAME() + "</b> to errode pixels from the edges of the registered mosaic tiles.</p>";
                return new MessageBox(msg, "Warning: Image may have soft edges", 
                    StdIcon.Warning, StdButton.Ignore, StdButton.Abort);
            };

            if (checkedRefViewId !== data.referenceView.fullId && 
                    !(searchFitsHistory(data.referenceView, TRIM_NAME()) || searchFitsHistory(data.referenceView, "TrimImage"))){
                console.warningln("Warning: '" + data.referenceView.fullId + "' has not been trimmed by the " + TRIM_NAME() + " script");
                if (getTrimMessageBox(data.referenceView).execute() === StdButton.Abort){
                    console.warningln("Aborted. Use " + TRIM_NAME() + " script to errode pixels from the registered image edges.");
                    return;
                }
                checkedRefViewId = data.referenceView.fullId;
            }

            if (checkedTgtViewId !== data.targetView.fullId){
                if (!(searchFitsHistory(data.targetView, TRIM_NAME()) || searchFitsHistory(data.targetView, "TrimImage"))){
                    console.warningln("Warning: '" + data.targetView.fullId + "' has not been trimmed by the " + TRIM_NAME() + " script");
                    if (getTrimMessageBox(data.targetView).execute() === StdButton.Abort){
                        console.warningln("Aborted. Use " + TRIM_NAME() + " script to errode pixels from the registered image edges.");
                        return;
                    }
                }
                checkedTgtViewId = data.targetView.fullId;
            }
        }
        
        if (!data.hasPixelScale){
            photometricMosaicDialog.getPixelScaleFromHdr(data);
        }

        // Run the script
        try {
            data.saveParameters();  // Save script parameters to the history.
            photometricMosaic(data, photometricMosaicDialog); 
        } catch (e){
            exception = e;
            new MessageBox("" + e, TITLE(), StdIcon.Error, StdButton.Ok).execute();
            break;
        }
        
        if (data.viewFlag === 0 && Parameters.isViewTarget){
            // If in ViewTarget mode, exit after the mosaic is created.
            break;
        }
    }
    if (data.cache !== undefined){
        data.cache.invalidate();
    }
    if (exception === null){
        saveSettings(data);
        console.hide();
    } else {
        throw exception;
    }
    return;
}
