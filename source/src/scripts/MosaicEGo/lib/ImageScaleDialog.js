/* global Dialog, DataType.Float, Settings, DataType.Int32, FrameStyle.Sunken, PIXEL_SIZE_DEFAULT, FOCAL_LENGTH_DEFAULT */

//"use strict";

/**
 * @param {Number} pixelSize Pixel size from header or undefined
 * @param {Number} focalLength Focal length from header or undefined
 * @param {String} keyPrefix Save 'Settings' /pixelSize and /focalLength using this prefix
 * @param {Boolean} enableAll 
 * @returns {ImageScaleDialog}
 */
class ImageScaleDialog extends Dialog
{
constructor( pixelSize, focalLength, keyPrefix, enableAll )
{
super();

    let titleLabel = new Label();
    titleLabel.frameStyle = FrameStyle.Sunken;
    titleLabel.margin = 4;
    titleLabel.wordWrapping = false;
    titleLabel.useRichText = true;
    titleLabel.text = "<p>PhotometricMosaic requires the following FITS headers:<br />" +
        "<b>XPIXSZ</b> (binned pixel size in microns)<br />" +
        "<b>FOCALLEN</b> (focal length in mm)</p>";

    let unknownPixelSize = false;
    if (!pixelSize){
        // pixel size did not exist in hdr.
        // Initialize the dialog value to the value entered last time
        unknownPixelSize = true;
        let keyValue = Settings.read( keyPrefix+"/pixelSize", DataType.Float );
        if ( Settings.lastReadOK ){
            pixelSize = keyValue;
        } else {
            pixelSize = PIXEL_SIZE_DEFAULT;
        }
    }
    
    let unknownFocalLength = false;
    if (!focalLength){
        // focal length did not exist in hdr.
        // Initialize the dialog value to the value entered last time
        unknownFocalLength = true;
        let keyValue = Settings.read( keyPrefix+"/focalLength", DataType.Int32 );
        if ( Settings.lastReadOK ){
            focalLength = keyValue;
        } else {
            focalLength = FOCAL_LENGTH_DEFAULT;
        }
    }
    
    let ok_Button = new PushButton(this);
    ok_Button.defaultButton = true;
    ok_Button.text = "OK";
    ok_Button.icon = this.scaledResource(":/icons/ok.png");
    ok_Button.onClick = function () {
        this.dialog.ok();
    };

    let buttons_Sizer = new HorizontalSizer;
    buttons_Sizer.spacing = 6;
    buttons_Sizer.addStretch();
    buttons_Sizer.add(ok_Button);

    let pixelSizeEdit = new NumericEdit();
    pixelSizeEdit.label.text = "Pixel size including binning (microns)";
    pixelSizeEdit.setReal(true);
    pixelSizeEdit.setPrecision(2);
    pixelSizeEdit.setRange(0.1, 100);
    pixelSizeEdit.setValue(pixelSize);
    pixelSizeEdit.enabled = enableAll || unknownPixelSize;
    pixelSizeEdit.toolTip = "<p>Pixel size including binning in microns.</p>" +
            "<p>For example, if the image has been resized to half size, or " +
            "uses 2x binning, the pixel size is 2x the sensor pixel size.</p>";
    pixelSizeEdit.onValueUpdated = function (value){
        // Update pixelSize and save the entered value for use next time.
        pixelSize = value;
        Settings.write( keyPrefix+"/pixelSize", DataType.Float, pixelSize );
    };
    
    let focalLengthEdit = new NumericEdit();
    focalLengthEdit.label.text = "Focal Length (mm)";
    focalLengthEdit.setReal(false);
    focalLengthEdit.setRange(1, 10000);
    focalLengthEdit.setValue(focalLength);
    focalLengthEdit.enabled = enableAll || unknownFocalLength;
    focalLengthEdit.toolTip = "Focal length in millimeters";
    focalLengthEdit.onValueUpdated = function (value){
        // Update focalLength and save the entered value for use next time.
        focalLength = value;
        Settings.write( keyPrefix+"/focalLength", DataType.Int32, focalLength );      
    };

    // Global sizer
    this.sizer = new VerticalSizer();
    this.sizer.margin = 10;
    this.sizer.spacing = 10;
    
    this.sizer.add(titleLabel);
    this.sizer.add(pixelSizeEdit);
    this.sizer.add(focalLengthEdit);
    this.sizer.add(buttons_Sizer);

    this.windowTitle = "Manual Entry";
    this.adjustToContents();
    
    /**
     * @returns {Number} Pixel size in microns
     */
    this.getPixelSize = function(){
        return pixelSize;
    };
    
    /**
     * @returns {Number} Focal length in mm
     */
    this.getFocalLength = function(){
        return focalLength;
    };
}

}
