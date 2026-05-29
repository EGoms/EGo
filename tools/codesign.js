// codesign.js
//
// Headless PixInsight code-signing worker. Generates a .xsgn signature
// sidecar next to each target .js/.scp script using a secure signing
// keys file (.xssk). Driven by tools/codesign.sh; not meant to be run
// by hand (it takes all of its input as command-line arguments).
//
// PixInsight has no command-line "codesign" command - signing is only
// exposed through the Security PJSR object, which runs inside the core
// application. This script is the automation-mode equivalent of the
// standard Script > CodeSign dialog: it loads the keys once, then loops
// over the target files.
//
// Invocation (see tools/codesign.sh):
//   PixInsight -n --automation-mode --no-attach \
//      -r="<this>,keys=<keys.xssk>,pwfile=<pw>,list=<manifest>[,entfile=<ent>]" \
//      --force-exit
//
// Arguments (Runtime.jsArguments, each "key=value"):
//   keys    path to the .xssk secure signing keys file
//   pwfile  path to a file whose raw bytes are the keys-file password
//   list    path to a manifest file: one target script path per line
//   entfile optional; one entitlement string per line (empty => none)
//
// The password is read as a ByteArray and handed to
// Security.loadSigningKeysFile(), which securely wipes it. The shell
// wrapper removes pwfile immediately after the run.

#engine v8

#feature-id    CodeSignWorker : EGo > (internal) Headless CodeSign Worker
#feature-info  Internal headless code-signing worker for the EGo repository.

function argValue( key )
{
   let prefix = key + "=";
   for ( let i = 0; i < Runtime.jsArguments.length; ++i )
   {
      let arg = Runtime.jsArguments[i];
      if ( arg.indexOf( prefix ) == 0 )
         return arg.substring( prefix.length );
   }
   return null;
}

function readNonEmptyLines( path )
{
   let lines = File.readLines( path );
   let out = [];
   for ( let i = 0; i < lines.length; ++i )
   {
      let s = lines[i].trim();
      if ( s.length > 0 )
         out.push( s );
   }
   return out;
}

function main()
{
   let keysFile = argValue( "keys" );
   let pwFile   = argValue( "pwfile" );
   let listFile = argValue( "list" );
   let entFile  = argValue( "entfile" );

   if ( keysFile == null || pwFile == null || listFile == null )
      throw new Error( "codesign.js: missing required argument (keys, pwfile, list)" );
   if ( !File.exists( keysFile ) )
      throw new Error( "codesign.js: signing keys file not found: " + keysFile );
   if ( !File.exists( pwFile ) )
      throw new Error( "codesign.js: password file not found: " + pwFile );
   if ( !File.exists( listFile ) )
      throw new Error( "codesign.js: target list file not found: " + listFile );

   let entitlements = [];
   if ( entFile != null && File.exists( entFile ) )
      entitlements = readNonEmptyLines( entFile );

   let targets = readNonEmptyLines( listFile );
   if ( targets.length == 0 )
      throw new Error( "codesign.js: no target files to sign" );

   // File.readFile returns a ByteArray of the raw bytes; the wrapper
   // writes the password with no trailing newline. loadSigningKeysFile
   // securely wipes this ByteArray once the keys are decrypted.
   let password = File.readFile( pwFile );
   let keys = Security.loadSigningKeysFile( keysFile, password );
   if ( !keys.valid )
   {
      keys.publicKey.secureFill();
      keys.privateKey.secureFill();
      throw new Error( "codesign.js: invalid signing keys file or wrong password" );
   }

   let success = 0;
   try
   {
      for ( let i = 0; i < targets.length; ++i )
      {
         let filePath = targets[i];
         console.writeln( "<end><cbr><br><raw>" + filePath + "</raw>" );

         if ( !File.exists( filePath ) )
         {
            console.criticalln( "** Target not found, skipping: <raw>" + filePath + "</raw>" );
            continue;
         }

         let ext = File.extractExtension( filePath ).toLowerCase();
         if ( ext != ".js" && ext != ".scp" )
         {
            console.warningln( "** Skipping non-script file: <raw>" + filePath + "</raw>" );
            continue;
         }

         let signaturePath = File.changeExtension( filePath, ".xsgn" );
         Security.generateScriptSignatureFile(
                        signaturePath,
                        filePath,
                        entitlements,
                        keys.developerId,
                        keys.publicKey,
                        keys.privateKey );
         console.noteln( "* Script signature generated: <raw>" + signaturePath + "</raw>" );
         ++success;
      }
   }
   finally
   {
      keys.publicKey.secureFill();
      keys.privateKey.secureFill();
   }

   console.noteln( format(
      "<end><cbr><br>===== codesign: %u succeeded, %u failed =====",
      success, targets.length - success ) );
   console.flush();

   if ( success != targets.length )
      throw new Error( "codesign.js: " + (targets.length - success) + " file(s) failed to sign" );
}

main();
