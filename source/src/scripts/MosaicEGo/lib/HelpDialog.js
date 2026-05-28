/* global Dialog, FrameStyle.Sunken */

//"use strict";

class HelpDialog extends Dialog {
    constructor() {
        super();

        let titleLabel = new Label();
        titleLabel.frameStyle = FrameStyle.Sunken;
        titleLabel.margin = 4;
        titleLabel.wordWrapping = false;
        titleLabel.useRichText = true;
        titleLabel.text =
                "<p>I provide the software for free (I'm not paid) in the hope that it will be useful, but I need your support.<br />" +
                "So if you find my software useful, please buy me a coffee! It will be really appreciated.</p>" +
                "<ul><li>27,000 lines of code (NormalizeScaleGradient 11,000; PhotometricMosaic 16,000).</li>" +
                "<li>I actively support these scripts on the PixInsight forum.</li></ul>" +
                "<p><b>Copy and paste the link into your browser. Thanks for your support, John Murphy.</b></p>";

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

        let webpage = new TextBox( this );
        webpage.text =
                "Buy me a 'coffee':\n" +
                "https://ko-fi.com/jmurphy\n\n" +
                "Website:\n" +
                "https://astroprocessing.com/" +
                "\n\nEmail:\n" +
                "johnastro.info@gmail.com";

        // Global sizer
        this.sizer = new VerticalSizer();
        this.sizer.margin = 10;
        this.sizer.spacing = 10;

        this.sizer.add(titleLabel);
        this.sizer.add(webpage);
        this.sizer.add(buttons_Sizer);

        this.windowTitle = "Thank you for your help and support!";
        this.adjustToContents();
    }
}
