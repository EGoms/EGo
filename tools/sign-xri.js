// sign-xri.js
//
// Headless PixInsight update-repository signing worker. Embeds an Ed25519
// <Signature> element in an update repository information document
// (updates.xri) using a secure signing keys file (.xssk). Driven by
// tools/sign-xri.sh; not meant to be run by hand (it takes all of its
// input as command-line arguments).
//
// PixInsight has no command-line crypto primitive: repository signing is
// only exposed through the Security PJSR object, which runs inside the
// core application. This script is the automation-mode equivalent of
// running the standard CodeSign script against an .xri, and is the
// companion to tools/codesign.js (which signs .js sources into .xsgn
// sidecars).
//
// The signature covers the canonicalized <xri> root element, which
// includes the <package sha1="..."> values. So this MUST run AFTER
// tools/build-package.sh has rewritten updates.xri with the final
// tarball hashes - any later edit to the .xri strips the signature.
//
// Invocation (see tools/sign-xri.sh):
//   PixInsight -n --automation-mode --no-attach \
//      -r="<this>,keys=<keys.xssk>,pwfile=<pw>,xri=<updates.xri>" \
//      --force-exit
//
// Arguments (Runtime.jsArguments, each "key=value"):
//   keys    path to the .xssk secure signing keys file
//   pwfile  path to a file whose raw bytes are the keys-file password
//   xri     path to the updates.xri document to sign in place
//
// The password is read as a ByteArray; the signing keys it decrypts are
// securely wiped after use. The shell wrapper removes pwfile after the run.

#engine v8

#feature-id    SignXRIWorker : EGo > (internal) Headless XRI Signing Worker
#feature-info  Internal headless update-repository signing worker for the EGo repository.

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

function main()
{
   let keysFile = argValue( "keys" );
   let pwFile   = argValue( "pwfile" );
   let xriFile  = argValue( "xri" );

   if ( keysFile == null || pwFile == null || xriFile == null )
      throw new Error( "sign-xri.js: missing required argument (keys, pwfile, xri)" );
   if ( !File.exists( keysFile ) )
      throw new Error( "sign-xri.js: signing keys file not found: " + keysFile );
   if ( !File.exists( pwFile ) )
      throw new Error( "sign-xri.js: password file not found: " + pwFile );
   if ( !File.exists( xriFile ) )
      throw new Error( "sign-xri.js: xri file not found: " + xriFile );

   // File.readFile returns a ByteArray of the raw bytes; the wrapper writes
   // the password with no trailing newline. loadSigningKeysFile securely
   // wipes this ByteArray once the keys are decrypted.
   let password = File.readFile( pwFile );
   let keys = Security.loadSigningKeysFile( keysFile, password );
   if ( !keys.valid )
   {
      keys.publicKey.secureFill();
      keys.privateKey.secureFill();
      throw new Error( "sign-xri.js: invalid signing keys file or wrong password" );
   }

   try
   {
      // Rewrites xriFile in place, replacing any existing <Signature>.
      Security.generateXMLSignature( xriFile,
                                     keys.developerId,
                                     keys.publicKey,
                                     keys.privateKey );
   }
   finally
   {
      keys.publicKey.secureFill();
      keys.privateKey.secureFill();
   }

   // Report what was written. Note: .valid reflects whether THIS machine
   // trusts the developer identity (a published CPD, or the local signing
   // identity). It can be false on an unsigned-CPD identity even though the
   // signature was generated correctly - so we do not hard-fail on it here.
   let sig = Security.getXMLSignature( xriFile );
   console.noteln( format(
      "<end><cbr><br>* updates.xri signed: developerId=<raw>%s</raw> timestamp=<raw>%s</raw> locallyTrusted=%s",
      sig.developerId, sig.timestamp, sig.valid ? "yes" : "no" ) );
   if ( !sig.valid )
      console.warningln( "** Signature is not locally trusted yet. This is expected until your "
                       + "CPD identity is approved and published by Pleiades (or a local signing "
                       + "identity for this license exists)." );
   console.flush();
}

main();
