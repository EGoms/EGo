Introduction
As most readers already know, I have been working hard for more than one year to replace the old SpiderMonkey 24 engine, which has been powering our JavaScript runtime since 2015, with a completely new, entirely redesigned, and fully rewritten runtime based on V8, Google's high-performance, open-source JavaScript and WebAssembly engine.

This monumental work is now complete, and the new runtime, available in version 1.9.4 Lockhart of PixInsight, has been thoroughly tested for stability and compatibility. We have already ported the most important standard scripts of our platform to the new V8 runtime, including the WBPP and FBPP preprocessing scripts, all astrometry scripts, and most utility and development scripts. The work to complete the transition to V8 will continue during the coming months. Many non-trivial scripts require substantial modifications to run on the new runtime. This is a delicate task, but for most scripts it isn't really difficult if properly implemented.

In this document, I'll describe the current status of the new PixInsight JavaScript Runtime (PJSR) and the required changes to port existing JavaScript code from the now-deprecated SpiderMonkey 24 engine to the V8 engine. The benefits can be immense, both in using a much cleaner, modern, and capable programming language and, depending on the algorithms and techniques implemented, in working with a much more efficient and highly performant infrastructure. At the end of this document, I'll provide information on new JavaScript classes with illustrative code examples. These new classes, along with others we have developed specifically for the new V8 runtime, can significantly improve your script development in PixInsight.

Runtime Selection
In the Linux, Windows, and macOS x64 versions of PixInsight 1.9.4 Lockhart, we'll have both JavaScript engines, the old SpiderMonkey 24 and the new V8, available in two completely independent runtimes. This will allow us to preserve compatibility with existing scripts while the transition to V8 becomes more widespread across third-party scripts. Unfortunately, the old SpiderMonkey engine is not available in the macOS ARM64 (native Apple Silicon) version of PixInsight 1.9.4. Eventually, in a future release during the 1.9 Lockhart cycle, we'll permanently remove the SpiderMonkey engine.

While the transition to the new runtime is complete, scripts will have to explicitly inform the PixInsight core application about the JavaScript runtime they want to be executed on. For compatibility with existing code, scripts will continue to run on the old SpiderMonkey runtime by default. To select the V8 runtime, we have the new #engine preprocessor directive:

#engine <engine_selector>

where <engine_selector> is one of

v8
v8-new
v8-default
v8-private
sm

The #engine directive must be placed at the beginning of a script's main executable file, just before #feature-id and other metadata directives. For example, this is the beginning of the now ported Ephemerides script:

Code:
#engine v8

#feature-id    Ephemerides : Ephemerides > Ephemerides

#feature-icon  @script_icons_dir/Ephemerides.svg

#feature-info  A script for calculation of ephemerides of solar system bodies \
               and stars.<br/>\
               <br/>\
               Written by Juan Conejero (PTeam)<br/>\
               Copyright &copy; 2017-2026 Pleiades Astrophoto, S.L.

CoreApplication.ensureMinimumVersion( 1, 9, 4 );

As you can see, we have a new CoreApplication.ensureMinimumVersion() function that you must use to prevent execution of your scripts on wrong versions of PixInsight.

The #engine directive supports several options for JavaScript engine selection, leading to different script execution modes:

Directive	Script Execution Mode
#engine v8	Equivalent to v8-new
#engine v8-new	The script will be executed on a newly created V8-based runtime, which will be destroyed automatically when the script terminates. This is the default V8 execution mode.

The advantage of this mode is that there is no risk of runtime pollution, even if a script performs arbitrary modifications to standard or core JavaScript objects and classes, or defines a large number of custom objects, classes, global variables, etc., since the new runtime is entirely independent and isolated. Everything a script generates when running in this mode will be automatically suppressed and cannot affect how other scripts interact with the platform.

Obviously, there is a cost to creating a new V8 runtime, especially given the large number of classes available on the PJSR and their complexity, as well as the execution of a considerable amount of bootstrap code during runtime startup. However, thanks to the implemented caching techniques and to the high execution performance provided by the V8 engine, the actual cost of this operation is negligible in practice. Initialization of a new V8-based runtime requires about 20-30 milliseconds on most tested machines, which is not a practical problem. The time required to preprocess a script's source code and validate its signature is usually much longer.
#engine v8-default	The script will be executed directly on the default V8 engine, also known as the root engine. The root engine persists throughout the PixInsight application session, and any side effects or alterations caused by executed scripts will remain in effect and cannot be easily undone, since there is currently no way to reset or reinitialize the root V8 engine. You can interact with the root engine via the v8 command in PixInsight's Process Console window, making this execution mode ideal for testing. However, its use is strongly discouraged in production scripts due to the risk of runtime pollution and undesirable alterations, especially when executing complex code.
#engine v8-private	In this mode, a new V8-based runtime will be generated the first time a script is executed, similar to the v8-new mode. However, the newly generated runtime won't be destroyed when the script terminates, but it will be left intact and associated with the script's executable file in a dedicated cache. The same runtime will be reused each time the same script is executed. This means that a script running in this mode has its own, private runtime that remains intact across successive script executions. This has the advantage that a script can modify its runtime arbitrarily by creating new classes, objects, variables, etc., and rely on all of those modifications being present each time it's executed.

The advantage of this execution mode, besides the possibility of a private, customized runtime, is that successive executions of the same script will require only a few microseconds for runtime selection. The main disadvantage is memory consumption: once the script is executed, its private runtime remains in memory for the rest of the PixInsight session.
#engine sm	The script will be executed on the legacy SpiderMonkey JavaScript runtime. This is the default execution mode when no #engine directive is specified, so using this selector is not necessary. The sm engine selector exists for completeness.

Removing #include <pjsr...> Directives
All the JavaScript header files in the include/pjsr directory are now deprecated and must not be used with the V8 runtime. All platform constants and standard objects are now part of the runtime and are available directly without requiring execution of additional code.

All constants previously defined (with #define directives) in *.jsh files are now directly available through specialized JavaScript classes that form part of the standard runtime. For example, the include/pjsr/StdIcon.jsh file defines the following constants:

Code:
/*
 * Standard MessageBox icons
 */
#define StdIcon_NoIcon        0
#define StdIcon_Question      1
#define StdIcon_Information   2
#define StdIcon_Warning       3
#define StdIcon_Error         4

These constans are now available (with identical values) as static read-only properties of the StdIcon class, which is part of the new V8-based JavaScript runtime:

JavaScript:
StdIcon.NoIcon
StdIcon.Question
StdIcon.Information
StdIcon.Warning
StdIcon.Error

So the required changes would be in this case:
Remove the directive: #include <pjsr/StdIcon.jsh>
Replace all instances of "StdIcon_" with "StdIcon."
The same procedure should be applied to all <pjsr/...> included files and their corresponding constants. There are a few cases where the required changes are a bit more involved:

These #define constants	Are now available as static read-only properties of
Cipher_*	CipherAlgorithm.*
Compression_*	CompressionAlgorithm.*
FileType_*, File_Attribute_*, FilePermission_*	FileFlag.*
GradientSpread_*	GradientSpreadMode.*
Interpolation_*	InterpolationAlgorithm.*
Key_*	KeyCode.*
MorphOp_*	MorphologicalOp.*
RBFType_*	RadialBasisFunction.*
ReadTextOptions_*	ReadTextOption.*
SampleType_*	PixelSampleType.*
TextAlign_*	TextAlignment.*

Replacing Constructor Functions with Classes
The old SpiderMonkey engine does not support JavaScript classes. Keep in mind that it is a very old engine, from 2014, that supports only ES5 language features, with just a few minor ES6 touches (such as arrow functions). The lack of classes isn't really the problem when porting scripts to the new V8 runtime, since constructor functions are standard JavaScript, and classes are syntactic sugar on top of them. The real problem is object inheritance, which relies on constructs that are no longer supported when a script-defined object inherits from a core PJSR object. In these cases, some code refactoring using classes is necessary.

The following code fragment shows the way we have been defining new objects inheriting from core PJSR objects:

JavaScript:
function FooDialog( foo, bar )
{
   this.__base__ = Dialog;
   this.__base__();

   this.foo = foo;
   this.bar = (bar !== undefined) ? bar : 42;
   ...
   this.kung = function( foo )
   {
      ...
   };
}

FooDialog.prototype = new Dialog;

The way a __base__ property is used above forms a dialect we have been using systematically to execute base object constructors inside a derived object's constructor, effectively generating all of the base object's properties and methods in each newly constructed instance of the derived object. Assigning a new base object instance to the derived constructor's prototype completed the prototype chain and implemented the required inheritance.

Unfortunately, this technique does not work at all with the new V8-based JavaScript runtime. It does not generate an error; it simply has no effect, and hence no inheritance is achieved. The only way to cause an object to inherit from a core PJSR object is by using JavaScript classes. The above example must be reimplemented as follows:

JavaScript:
class FooDialog extends Dialog
{
   constructor( foo, bar = 42 )
   {
      super();

      // Place here all the code that performs the construction and
      // initialization of a newly created FooDialog instance.
      this.foo = foo;
      this.bar = bar;
      ...
   }

   // Class methods, properties, getters, setters, etc., come here.
   kung( foo )
   {
      ...
   }
}

Note that the assignment to FooDialog's prototype is now an error. All of these assignments at the end of object constructors must be suppressed when porting code to the V8 runtime.

Note also that the above class definition can be problematic if your script is executed more than once within the same V8-based runtime; for example, if you use a private runtime selected with the #engine v8-private directive, or the root runtime with #engine v8-default. This is because class declarations cannot be redeclared in the same scope. In these cases, a class expression may be necessary:

JavaScript:
var FooDialog = class extends Dialog
{
   ...
};

In general, unless you are sure your code will always run in a newly created JavaScript runtime, using class expressions rather than class declarations is advisable.

New PJSR Classes
The new V8-based JavaScript runtime in PixInsight 1.9.4 Lockhart provides many more standard classes and resources than the old SpiderMonkey runtime. There are also hundreds of design errors fixed, redesigned classes, code optimizations, enhanced diagnostics, and many other improvements. Among the new features, the following classes are particularly worth mentioning:


FMath

This class is a fast alternative to the standard Math object with many additional functions and features, implemented in JavaScript using WebAssembly and other techniques that enable ahead-of-time compilation in the V8 JavaScript engine. The performance improvement achieved with FMath is spectacular; in many cases, it can be an order of magnitude faster than standard Math calls, essentially running at native speed. FMath provides all functions available in the standard Math object, along with its PJSR extensions, plus many more specialized methods for performance optimization. In all code performing heavy calculation tasks, we recommend replacing all "Math." calls with "FMath." ones.


Stat

The new Stat class specializes in statistical calculations. Most of its static methods were previously available as PJSR extensions of the standard Math object. The old Math methods are still available for compatibility with existing code, but they are now deprecated (and emit deprecation warnings when used) and must be replaced with the equivalent Stat methods. Stat allows us to write better-organized, more readable code without contaminating standard JavaScript objects with unnecessary extensions.


ImageIterator

Thanks to this class, you can now access image pixels directly at nearly native speed without any intermediation from C++/JavaScript bridge code. ImageIterator uses an extremely nice V8 feature that allows us to create a typed array object whose underlying ArrayBuffer has direct access to the pixel data in a channel of the image, in a completely transparent way. An ImageIterator object behaves like a Matrix instance, where matrix rows and columns allow you to address pixels by their image coordinates using standard array subscript notation.

Consider the following example script:

JavaScript:
/*
 * An example script to apply an automatic midtones transfer function using
 * image iterators.
 *
 * Note: This script assumes that the active image is in 32-bit or 64-bit
 * floating point real format.
 *
 * Example script released under PixInsight Class Library License version 2.0:
 * https://pixinsight.com/license/PCL-License-2.0.html
 */
#engine v8-default

CoreApplication.ensureMinimumVersion( 1, 9, 4 );

(() =>
{
   console.show();

   ImageWindow.activeWindow.currentView.beginProcess();

   let image = ImageWindow.activeWindow.currentView.image;

   // Create an image iterator for each nominal channel of the image.
   let I = [], m = [];
   for ( let c = 0; c < image.numberOfNominalChannels; ++c )
   {
      // Create a new image iterator for this channel.
      I.push( new ImageIterator( image, c ) );
      // Calculate the required midtones balance to achieve median = 0.5.
      m.push( FMath.mtf( 0.25, image.median( new Rect(), c, c ) ) );
   }

   let E = new ElapsedTime;

   // For each channel
   for ( let c = 0, n = I.length; c < n; ++c )
   {
      // The image iterator for this channel.
      let i = I[c];
      // For each pixel sample: apply the midtones transfer function.
      for ( let y = 0, h = i.height; y < h; ++y )
         for ( let x = 0, w = i.width; x < w; ++x )
         {
            // Read the pixel value at channel c, row y, column x.
            let v = i[y][x];
            // Write the modified pixel.
            i[y][x] = FMath.mtf( m[c], v );
         }
   }

   console.writeln( E.text );

   ImageWindow.activeWindow.currentView.endProcess();
})();

This script applies an automatic midtones transfer function (MTF) to all pixel samples of the active image, channel by channel. Of course, the same operation can be implemented in faster ways, but this is a good example to demonstrate how the new ImageIterator class works and the performance to be expected. With this example as a starting point, you have all the information you need to start applying image iterators in your scripts to implement sophisticated image processing algorithms. In this initial version of the new V8-based runtime, we still don't have JavaScript worker threads. We'll have them soon, and then image iterators will be ideal to implement multithreaded image processing tasks.

There is a very important aspect of image iterators that must be pointed out. With image iterators, you access the actual pixel data, not an abstraction, unlike other pixel access methods of the Image class, such as Image.sample() and Image.setSample(). For real-valued images, you can use image iterators very easily because the pixel sample values are either 32-bit or 64-bit floating-point numbers. Both data types naturally match the standard JavaScript Number type. The same happens with complex-valued images, where image iterators provide access to a succession of alternate real and imaginary floating-point components.

However, if the image stores integer pixel data, you must take into account the image's integer format's nominal range. For example, for a 16-bit integer image, pixel values are in the [0,65535] range, where 0 represents black and 65535=2**16-1 represents white (note that all integer images store unsigned values in PixInsight). The following script is a modification of the previous one that takes this possibility into account in an optimal way:

JavaScript:
/*
 * An example script to apply an automatic midtones transfer function using
 * image iterators.
 *
 * This script can work with floating point and integer real images.
 *
 * Example script released under PixInsight Class Library License version 2.0:
 * https://pixinsight.com/license/PCL-License-2.0.html
 */
#engine v8-default

CoreApplication.ensureMinimumVersion( 1, 9, 4 );

(() =>
{
   console.show();

   ImageWindow.activeWindow.currentView.beginProcess();

   let image = ImageWindow.activeWindow.currentView.image;

   // Create an image iterator for each nominal channel of the image.
   let I = [], m = [];
   for ( let c = 0; c < image.numberOfNominalChannels; ++c )
   {
      // Create a new image iterator for this channel.
      I.push( new ImageIterator( image, c ) );
      // Calculate the required midtones balance to achieve median = 0.5.
      m.push( FMath.mtf( 0.25, image.median( new Rect(), c, c ) ) );
   }

   function processFloatingPoint( I, m )
   {
      for ( let c = 0, n = I.length; c < n; ++c )
         for ( let i = I[c], y = 0, h = i.height; y < h; ++y )
            for ( let x = 0, w = i.width; x < w; ++x )
               i[y][x] = FMath.mtf( m[c], i[y][x] );
   }

   function processInteger( I, m )
   {
      for ( let c = 0, n = I.length; c < n; ++c )
         for ( let i = I[c], y = 0, h = i.height; y < h; ++y )
            for ( let x = 0, w = i.width; x < w; ++x )
               i[y][x] = i.toSample( FMath.mtf( m[c], i.toReal( i[y][x] ) ) );
   }

   let E = new ElapsedTime;

   // Call the specialized function appropriate for the image's pixel format.
   if ( image.isInteger )
      processInteger( I, m );
   else
      processFloatingPoint( I, m );

   console.writeln( E.text );

   ImageWindow.activeWindow.currentView.endProcess();
})();

Note the use of the ImageIterator.toReal() and ImageIterator.toSample() methods. The first function converts a pixel sample to a Number value in the range [0,1]. The second one converts from [0,1] to the image's native range. Of course, these conversions have a computational cost when used in the inner loop of a pixel-by-pixel transformation. That's why we have written two separate functions: one specific to floating-point data and the other for integer data.


StarDetector

The new StarDetector class provides access to our standard star-detection algorithms via a core PJSR object implemented in C++. Previously, StarDetector was available as a quite complex JavaScript implementation, which was good, but of course, the new one is much faster and has more features. You no longer need to #include <pjsr/StarDetector.jsh> in your code, and in fact must not include it, as StarDetector is directly available as a core class whose interface is compatible with the previous one.

Here is a demonstration script that generates a mask with all detected stars on the active image. The script uses the default StarDetector parameters, except for the StarDetector.fitPSF property, which is set to true for demonstration purposes. When this option is enabled, StarDetector fits an elliptical Gaussian function to each detected source. This improves the stability of calculated star positions, but for 'serious' PSF fitting, you'll prefer to use the new PSF class, which we describe in the next section.

JavaScript:
/*
 * An example script to demonstrate the new StarDetector class available in the
 * V8 JavaScript runtime since PixInsight 1.9.4 Lockhart.
 *
 * This script generates a mask with all detected stars in the active image.
 *
 * Example script released under PixInsight Class Library License version 2.0:
 * https://pixinsight.com/license/PCL-License-2.0.html
 */
#engine v8-default

CoreApplication.ensureMinimumVersion( 1, 9, 4 );

(() =>
{
   console.show();

   let image = ImageWindow.activeWindow.mainView.image;
   image.statusEnabled = true;

   let D = new StarDetector;
   D.fitPSF = true; // enable PSF fitting for higher accuracy (optional)

   // The StarDetector.stars() method returns an array of StarData objects.
   let E = new ElapsedTime;
   let stars = D.stars( image );
   console.writeln( format( "<end><cbr><br>* StarDetector: %u stars found ", stars.length ) );
   console.writeln( E.text );

   // Generate a Bitmap rendition of all detected stars.
   let bitmap = new Bitmap( image.width, image.height );
   bitmap.fill( 0xffffffff );
   let G = new Graphics( bitmap );
   G.antialiasing = true;
   G.pen = new Pen( 0xff000000 );
   for ( let i = 0; i < stars.length; ++i )
   {
      let s = stars[i];
      G.strokeEllipse( s.srect.x0, s.srect.y0, s.srect.x1, s.srect.y1 );
      G.strokeRect( s.pos.x-0.5, s.pos.y-0.5, s.pos.x+0.5, s.pos.y+0.5 );
   }
   G.end();

   // Create a new image window with the bitmap rendition.
   let window = new ImageWindow( bitmap.width, bitmap.height,
                            1,      // numberOfChannels
                            8,      // bitsPerSample
                            false,  // floatSample
                            false,  // color
                            "stars" );
   window.mainView.beginProcess( UndoFlag.NoSwapFile );
   window.mainView.image.blend( bitmap );
   window.mainView.endProcess();
   window.show();
   window.zoomToFit();
})();


PSF

This class provides access to our standard point spread function fitting algorithms. The underlying C++ implementation uses the Levenberg-Marquardt algorithm to numerically fit a point spread function model to a set of sources in an image. It is fully multithreaded and uses highly optimized code, so you can expect the same performance as with C++ PCL-based modules. Besides applications in astrometry, the PSF class gives you access to our standard hybrid PSF/aperture photometry, as used in processes such as LocalNormalization, SpectrophotometricColorCalibration, etc.

Here is an example script that detects all stars in the active image, fits them to optimal PSF models, and generates a plain text file in standard CSV format with the positions and photometric data of all fitted sources:

JavaScript:
/*
 * An example script to demonstrate the new PSF class available in the V8
 * JavaScript runtime since PixInsight 1.9.4 Lockhart.
 *
 * This script generates a plain text file in CSV format with the data of all
 * stars fitted in the active image.
 *
 * Example script released under PixInsight Class Library License version 2.0:
 * https://pixinsight.com/license/PCL-License-2.0.html
 */
#engine v8-default

CoreApplication.ensureMinimumVersion( 1, 9, 4 );

(() =>
{
   console.show();

   let image = ImageWindow.activeWindow.mainView.image;
   image.statusEnabled = true;

   // Star detection
   let D = new StarDetector;
   let stars = D.stars( image );
   console.writeln( format( "<end><cbr>* %u stars found.", stars.length ) );

   // PSF fitting
   let P = PSF.fitStars( image, stars, PSFunction.Auto );
   console.writeln( format( "<end><cbr>* %u valid sources.", P.length ) );

   // CSV file generation
   let f = File.createFileForWriting( "/tmp/psf-data.csv" );
   f.outTextLn( "B,A,x,y,FWHMx,FWHMy,theta,function,beta,signal,MAD" );
   for ( let i = 0; i < P.length; ++i )
   {
      let p = P[i];
      f.outTextLn( format( "%.3e,%.3e,%.2f,%.2f,%.2f,%.2f,%.2f,%s,%.2f,%.4e,%.4e",
         p.B, p.A, p.x, p.y, p.fwhmX, p.fwhmY, p.theta, p.functionName, p.beta, p.signal, p.mad ) );
   }
   console.writeln( "<end><cbr>* Text file generated:" + f.path );
   f.close();

})();

Here is an example of the output that can be generated with this simple script, after converting the CSV file to a spreadsheet:

PSF-spreadsheet.png


BRQuadTree

A quadtree is a specialized binary search tree for partitioning a set of geometric entities in two-dimensional space. Quadtrees are essential building blocks for the solution of computational geometry problems in a wide variety of image analysis algorithms. BRQuadTree implements an efficient, versatile bucket-region quadtree in pure JavaScript, with important optimizations, and is available directly as a core PJSR object in the new V8 runtime. Please remove all #include <pjsr/BRQuadTree.jsh> directives in your ported scripts.


Matrix, Vector, Point, Rect

These classes have been reimplemented as pure JavaScript code in the new V8 runtime. Previously, they were implemented in C++ due to limitations in the old SpiderMonkey engine, and their performance was very poor because of the necessary bridge code. None of these limitations exists in V8, so the performance of these classes is now very good, essentially at the level of native C++ implementations.

The new Vector and Matrix classes implement high-level abstractions of the corresponding mathematical structures, with a rich interface suitable for most numerical analysis applications. When necessary, these classes can be easily extended with JavaScript class inheritance. Indexed access to vector components and matrix elements is now available for read/write operations using standard array subscript notation, allowing a natural syntax identical to that in the PCL/C++ versions of these objects. For example, you can now write (real fragment excerpted from our astrometry code base):

JavaScript:
let ref_F_I = new Matrix(
   1,  0,              -0.5,
   0, -1, this.height + 0.5,
   0,  0,               1 );

let ref_F_G = this.ref_I_G_linear.mul( ref_F_I );
wcs.cd1_1 = ref_F_G[0][0];
wcs.cd1_2 = ref_F_G[0][1];
wcs.cd2_1 = ref_F_G[1][0];
wcs.cd2_2 = ref_F_G[1][1];

let orgF = ref_F_G.inverse().apply( new Point( 0, 0 ) );
wcs.crpix1 = orgF.x;
wcs.crpix2 = orgF.y;

Note the use of adjacent array subscripts, as in [0][1], to access matrix elements by their row and column indexes. Note also the convenience of chained matrix operations, as in ref_F_G.inverse().apply().

The new Rect and Point classes have also been reimplemented in pure JavaScript with similar features, enabling the efficient manipulation of these fundamental geometric entities in the new V8 JavaScript runtime.


XML Support Classes

The new V8 JavaScript runtime includes a complete set of classes implementing XML support. The functionality of these classes is the same as that available on the PCL/C++ platform, enabling the development of powerful and efficient XML-based code and applications.

Here is a demonstration script showing how to generate a new XML document by defining its elements and their attributes:

JavaScript:
/*
 * An example script to demonstrate the new XML support classes available in
 * the V8 JavaScript runtime since PixInsight 1.9.4 Lockhart.
 *
 * This script generates a new XML document and serializes it as a new plain
 * text file in UTF-8 format.
 *
 * Example script released under PixInsight Class Library License version 2.0:
 * https://pixinsight.com/license/PCL-License-2.0.html
 */
#engine v8-default

CoreApplication.ensureMinimumVersion( 1, 9, 4 );

(() =>
{
   let xml = new XMLDocument;

   xml.xml = new XMLDeclaration( "1.0", "UTF-8" );
   xml.addNode( new XMLComment( "\nPixInsight Foo Bar File - FooBar version 1.0" +
                                "\nCreated with PixInsight software - https://pixinsight.com/" +
                                "\n" ) );

   xml.rootElement = new XMLElement( "foobar" )
      .setAttribute( "version", "1.0" )
      .addChildNode( new XMLElement( "CreationTime" )
                        .addChildNode( new XMLText( (new Date).toString() ) ) )
      .addChildNode( new XMLElement( "Foo" )
                        .addChildNode( new XMLElement( "foo1" )
                           .setAttributes( [["value", "42"],
                                            ["bar",   "foo"]] ) )
                        .addChildNode( new XMLElement( "foo2" )
                           .setAttributes( [["value", "123.456"],
                                            ["everything", "42"]] ) ) )
      .addChildNode( new XMLElement( "SomeText" )
                        .addChildNode( new XMLText( "The quick brown fox jumps over the lazy dog." ) ) )
      .addChildNode( new XMLElement( "SomethingObvious" )
                        .setAttribute( "theMeaningOfEverything", "42" ) );

   xml.autoFormatting = true;
   xml.serializeToFile( "/tmp/test.xml" );
})();

The generated XML file is:

XML:
<?xml version="1.0" encoding="UTF-8"?>
<!--
PixInsight Foo Bar File - FooBar version 1.0
Created with PixInsight software - https://pixinsight.com/
-->
<foobar version="1.0">
   <CreationTime>Wed Mar 11 2026 18:41:59 GMT+0100 (CET)</CreationTime>
   <Foo>
      <foo1 value="42" bar="foo"/>
      <foo2 value="123.456" everything="42"/>
   </Foo>
   <SomeText>The quick brown fox jumps over the lazy dog.</SomeText>
   <SomethingObvious theMeaningOfEverything="42"/>
</foobar>

Ever wanted to inspect an XISF header? The following script reads the header of a monolithic XISF file, parses it as an XML document, and writes it formatted (with indentation) as a new XML file:

JavaScript:
/*
 * An example script to demonstrate the new XML support classes available in
 * the V8 JavaScript runtime since PixInsight 1.9.4 Lockhart.
 *
 * This script reads the header of a monolithic XISF file and writes it
 * formatted as a plain text XML file.
 *
 * Example script released under PixInsight Class Library License version 2.0:
 * https://pixinsight.com/license/PCL-License-2.0.html
 */
#engine v8-default

CoreApplication.ensureMinimumVersion( 1, 9, 4 );

(( xisfFilePath, xmlFilePath ) =>
{
   // Open the XISF file
   let file = File.openFileForReading( xisfFilePath );

   // Get the XISF signature (8 bytes)
   let signature = file.read( DataType.ByteArray, 8 );
   if ( signature.toString() != "XISF0100" )
      throw new Error( "Not an XISF 1.0 file: " + xisfFilePath );

   // Read the XISF header length in bytes
   let headerLength = file.read( DataType.Uint32, 1 );
   if ( headerLength < 65 )
      throw new Error( "Invalid XISF header length: " + xisfFilePath );

   // Read the XISF header
   file.seek( 16, SeekMode.FromBegin );
   let header = file.read( DataType.ByteArray, headerLength );

   file.close();

   // Parse the XISF header and serialize it beautified
   let xml = new XMLDocument;
   xml.parse( header.utf8ToString() );
   xml.autoFormatting = true;
   xml.serializeToFile( xmlFilePath );

})( "/tmp/test.xisf", "/tmp/test-header.xml" );


System

The non-instantiable System class gives you access to a number of properties of the host machine and operating system. For example, you can run the following command from PixInsight's Process Console window:

v8 JSON.stringify( System.physicalMemoryStatus() )​

to get information about the physical memory size and availability:

{"totalBytes":810916085760,"availableBytes":785220763648}​

As with the rest of core PJSR classes, you can use the Object Explorer window to get complete information about System's properties and static methods.

Breaking Changes and Deprecated Functions
One of our main goals while designing and implementing the new V8-based JavaScript runtime has been to preserve compatibility with existing code by minimizing modifications to core classes and avoiding changes that could disrupt existing scripts. Despite our efforts, the following breaking changes have been caused by fundamental engine differences and redesigned classes, methods, and properties in the new V8 runtime.

Deprecated: The global gc() method

In the legacy SpiderMonkey JavaScript engine, the gc() method allowed you to force garbage collection at several levels (from a fast, light collection to a deep collection that destroys and deallocates every unreferenced object). Besides being much more efficient and faster, V8's garbage collector differs in many fundamental aspects. One of them is that its operation cannot be forced in any way. Because of this fact, the global gc() method has been deprecated in the new V8 JavaScript runtime and must not be used in any new or ported code. Calling it has no effect and only issues a deprecation warning message.​
​
In the V8 runtime, there is absolutely no guarantee as to when, or even if, an unreferenced object will be garbage-collected during the execution of a script. There is no way to influence or favor these operations, either, since the engine's garbage collector operates in a completely autonomous, non-deterministic fashion. Due to this difference, some practices that were sound in the legacy engine should now be avoided as far as possible. An important one involves the use of objects that can allocate large memory blocks internally, such as Image, Bitmap, and ByteArray.​
​
Here is an example to demonstrate these differences. The following code worked perfectly in the old runtime:​
​
function zoomedRendition( bitmap, zoomFactor )​
{​
return bitmap.toImage().render( zoomFactor, false/*enableTransparency*/, true/*fast*/ );​
}​
​
...​
let zoomedBitmap = zoomedRendition( sourceBitmap, zoomFactor );​
...​
gc();​
...​
​
In the zoomedRendition function, we are creating a new Image object by calling the Bitmap.toImage() method. Of course, the newly created image may require allocation of large memory blocks, depending on the dimensions of the source bitmap. Most of these temporary instances of the Image class should be garbage-collected automatically when zoomedRendition() returns, and anyway, their destruction will be forced, along with that of the rest of the unused bitmaps, by the subsequent call to gc().​
​
With the new V8 runtime, this generally does not work as described above, and there is no gc(). V8's garbage collector has been engineered for extreme execution optimization and efficiency, and its behavior cannot be forced or conditioned. Deallocation of unused or unreferenced objects is never guaranteed, and in most cases, you'll observe that it doesn't happen unless the engine detects serious memory pressure. This can cause unexpected problems, especially when module-defined process instances are executed (e.g., by calling ProcessInstance.executeOn()), since their execution has no implications for the JavaScript engine. For optimization of memory resources during script execution, the previous example should be implemented differently for execution on the V8 runtime:​
​
function zoomedRendition( bitmap, zoomFactor )​
{​
let image = bitmap.toImage();​
let zoomedBitmap = image.render( zoomFactor, false/*enableTransparency*/, true/*fast*/ );​
image.free(); // deallocate​
return zoomedBitmap;​
}​
​
...​
let zoomedBitmap = zoomedRendition( sourceBitmap, zoomFactor );​
...​
zoomedBitmap.clear(); // deallocate when no longer necessary​
...​
​
The explicit calls to Image.free() and Bitmap.clear() ensure that the memory blocks allocated internally by the native C++ implementations of these objects are deallocated immediately when they are no longer in use. The associated JavaScript objects are lightweight envelopes requiring minimal memory allocation, so their garbage collection is generally irrelevant. Similar forced deallocation methods exist in all core JavaScript classes with potentially large memory requirements.​
​
Deprecated: Most of Global.*

All properties and methods of the Global object (that is, the globalThis object) that are defined as extensions by the PixInsight JavaScript runtime are now deprecated and issue deprecation warnings when they are used in running code, with the following exceptions:​
​
void cerr( String text )​
void cerrln( String text )​
void cflush()​
void cout( String text )​
void coutln( String text )​
String format( String fmt, ... )​

Only these methods are not deprecated. The rest of global extensions are now available as methods and properties of the CoreApplication, Runtime, File, and System classes.​
​
Removed: .prototype to access process constants

In the old runtime, symbolic constants (such as enumeration values) defined by installed processes were properties of the process class prototype. This is not true in the V8 runtime: all static properties now belong to the class constructor, as they must. Note that the old behavior was a serious design error that has now been fixed, as expected.​
​
For example, this code fragment, which worked in the old runtime:​
​
let SA = new StarAlignment;​
SA.referenceImage = STAR_CSV_FILE;​
SA.referenceIsFile = true;​
SA.mode = StarAlignment.prototype.OutputMatrix;​
SA.intersection = StarAlignment.prototype.NoIntersection;​
SA.rbfType = StarAlignment.prototype.DDMThinPlateSpline;​
​
must be rewritten as follows to work on the V8 runtime:​
​
let SA = new StarAlignment;​
SA.referenceImage = STAR_CSV_FILE;​
SA.referenceIsFile = true;​
SA.mode = StarAlignment.OutputMatrix;​
SA.intersection = StarAlignment.NoIntersection;​
SA.rbfType = StarAlignment.DDMThinPlateSpline;​
​
As you see, all '.prototype' accessors must be removed when working with process classes.​

Removed: VectorGraphics

In the legacy SpiderMonkey engine, VectorGraphics specialized in drawing operations using non-integer, floating-point coordinates. This class does not exist in the V8 JavaScript runtime because it is not necessary: the Graphics class automatically manages all coordinate types in a highly optimized way. You must replace all references to VectorGraphics with Graphics in your V8-ported code.​
​
Removed: ImageStatistics

The ImageStatistics object is not available in the new V8 JavaScript runtime. The entire functionality provided by this object in the legacy SpiderMonkey engine is now available directly in the Image class through specialized methods and properties, such as Image.median(), Image.MAD(), Image.stdDev(), Image.rangeClippingEnabled, etc.​

void Control.showAlias()
void Control.hideAlias()

These methods have been suppressed, since they are no longer necessary with the reimplemented graphical interface in PJSR. If you use them in your code, simply remove them and let the internal PJSR graphical layout routines do their job to prevent screen flickering when you update your script's dialog.​

Array Compression.compress( String|ByteArray|TypedArray data )

In the old SpiderMonkey engine, this method returned an array of arrays with the compressed data. In the V8 engine, this method returns an array of objects with properties storing the compressed data. Each element of the returned array contains the data of a compressed subblock. Each subblock is an object with the following properties:​
​
compressedData (ByteArray)​
The compressed subblock data.​
​
uncompressedSize (BigInt)​
The uncompressed subblock size in bytes.​
​
checksum (BigInt)​
The subblock checksum for integrity verification.​
​
Usually, a single array element is returned, but some compression algorithms may have size limitations for compression of very large data blocks. In those cases, which are infrequent, more than one subblock may be necessary.​

ByteArray Compression.uncompress( Array subblocks )

Now this method expects to receive an array of subblock objects, as described in the previous section, instead of an array of arrays.​

Array EphemerisFile.objects

The value of this property is now an array of objects with properties describing all the objects available in an XEPH ephemeris file. In the old SpiderMonkey engine, this property was an array of arrays. The EphemerisFile class is now fully documented; please refer to the official documentation available on the Object Explorer window for complete information.​

Array EphemerisFile.visibleObjects( ImageWindow window, Position P[, magMax[, magMin[, Rect rect]]] )

As before, this method returns an array of objects instead of an array of arrays. Refer to the official documentation for the EphemerisFile class for details.​

FileFormat.formatSpecificData
FileFormat.usesFormatSpecificData
FileFormat.validateFormatSpecificData()
FileFormat.disposeFormatSpecificData()

These methods and properties have been removed in the new V8 runtime. They are no longer necessary because format-specific data is automatically managed by the underlying file format support module. This was a design mistake that we have fixed.​

Array|null FileFormatInstance.open( String filePath[, String hints] )

In the old SpiderMonkey engine, this method returns null if the file open operation fails, but also if the image file does not contain any readable image. In the new V8 runtime, an empty array is returned if the file does not contain any supported image, and null is only returned if the I/O operation fails.​

Image.forEachSample()
Image.forEachMutableSample()
Image.forEachPixel()
Image.forEachMutablePixel()

These methods have been removed in the new V8 JavaScript runtime. They are no longer necessary because we now have the ImageIterator class, which provides efficient access to image pixel data at nearly native speed, and allows for multithreaded execution (when worker threads are available in the new runtime).​

void ImageWindow.purge( [Boolean swapFiles = true[, Boolean properties = true[, Boolean notify = true]]] )

In the old engine, this function accepted additional Boolean arguments to removed histograms and statistical properties. These arguments have been removed in the V8 engine because view properties are now managed automatically by the platform.​

View|null ImageWindow.previewById( String id )

This method now returns null if a preview with the specified identifier is not found in the parent image window. Previously, this method returned an invalid View object in these cases.​

View.properties

The value of this property is now an empty Array object when the view is invalid (i.e., when View.isNull is true). Previously, null was returned in these cases.​

View|null View.viewById( String viewId )

In the new V8 runtime, this static method returns null when no View object exists with the specified identifier. In the old runtime, this method returned an invalid View object in these cases.​

uint View.propertyAttributes( String id )

This method now returns PropertyAttribute.Invalid when no property exists with the specified identifier. Previously it returned null in that case.​

int View.propertyType( String id )

This method now returns PropertyType.Invalid when no property exists with the specified identifier. Previously it returned null in that case.​

ImageWindow View.window

The value of this property is now null if the view is invalid. Previously an invalid ImageWindow object was provided.​

Image View.image

The value of this property is now null if the view is invalid. Previously an invalid Image object was provided.​

Limitations
Unsupported: JavaScript Modules

JavaScript modules were introduced by ECMAScript 6 in 2015. Obviously, our legacy SpiderMonkey 24 engine, from 2014, knows nothing about them. Of course, the stable V8 engine version we have now integrated into PixInsight 1.9.4 fully supports JavaScript module syntax; it actually supports the entire ECMAScript 2025 specification.

However, JavaScript modules require significant support from the host application. We have not implemented such support in PixInsight 1.9.4 for several reasons. One of them is complexity: supporting modules is not a trivial task and requires development and testing work we cannot afford at this point, as we are focused on performance, stability, and the sophistication of our JavaScript runtime. Another, more critical, reason is security. Modules pose obvious risks of uncontrolled code execution, requiring delicate refactoring of our code signing and security system, which we must design and implement calmly and without pressure. We'll do this, but not for now.

Our JavaScript runtime includes a powerful, versatile code preprocessor similar to the standard C preprocessor, which is perfectly integrated with our development platform and code security system. The #include directive works exactly as it does in any standard C and C++ compiler and allows you to split complex scripts and applications into separate source units in a very convenient way. Most standard and third-party scripts have already done this for many years.


JavaScript Preprocessor: Potential Conflicts

Our JavaScript preprocessor, as described above, uses the same syntax as the standard C preprocessor. This means that preprocessor directives must be written in separate lines starting with the hash symbol, such as #include, #define, or #ifdef. ECMAScript 2022 introduced private class properties and methods, a useful feature that allows us to write better-structured code using classes. Private class fields start with a hash, such as #bar (declaration) and Foo.#bar (reference).

Since their syntax is very similar, there is a risk of conflict between our preprocessor directives and private class fields. However, there is no problem in practice, as our preprocessor simply ignores any line that starts with '#' and is not followed by a valid preprocessor directive identifier. For example, the following code causes no problems:

JavaScript:
#engine v8

#include "Foo.js"

class Bar extends Foo
{
    // Private property declarations.
    #bar = 42;
    #myPrivateProp;

    constructor( bar )
    {
        super();
        this.#bar ??= bar;
    }
    ...
    this.#bar = FMath.sqrt( this.#myPrivateProp );
    ...
}

Simply avoid using any of the supported preprocessor directives as class private identifiers, and there will be no problems at all:

#define​
#else​
#endif​
#engine​
#error​
#feature-icon​
#feature-id​
#feature-info​
#if​
#ifdef​
#ifeq​
#ifgt​
#ifgteq​
#iflt​
#iflteq​
#ifndef​
#ifneq​
#ifnoneof​
#ifoneof​
#include​
#script-id​
#undef​
#warning​

We are considering extending our preprocessor syntax to use legal JavaScript syntax, such as lines starting with special //# comments instead of hashes. This will probably be available in a future version during the 1.9 Lockhart cycle. Anyway, we have no practical problem, so there is no rush with this.

Future Directions
The current V8 JavaScript runtime in PixInsight 1.9.4 Lockhart is an initial version where we have prioritized the following aspects:
Fix important design mistakes and bugs present in the old SpiderMonkey runtime.
Maximize compatibility with the old SpiderMonkey runtime.
Implement a new rich set of standard classes providing comprehensive access to our image processing and data analysis code base.
Maximize performance with ahead-of-time compilation and special techniques to facilitate in-time compiler optimizations.
Ensure stability of the new V8-based PixInsight JavaScript runtime.
Of course, this is just the beginning of the story. Google's V8 JavaScript engine is a masterpiece of contemporary software design and development. Its high performance and extensive capabilities will allow us to significantly enhance our JavaScript development platform in the medium- to long-term. The following tasks are among our highest priorities at present:
Multithreaded JavaScript execution with new worker thread classes.
Overcome the modal Dialog interface limitation: Scripts will have the possibility to define non-modal process interfaces fully integrated with the PixInsight platform, just as PCL/C++ modules.
New classes to improve the data analysis and image processing capabilities of PJSR.
Other future plans include:
A mixed JavaScript/C++ execution model.
A JavaScript debugger integrated in the PixInsight core application.