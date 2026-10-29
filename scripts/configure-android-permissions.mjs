import fs from 'node:fs';
import path from 'node:path';

const manifestPath = path.resolve(
  process.cwd(),
  'android/app/src/main/AndroidManifest.xml'
);

if (!fs.existsSync(manifestPath)) {
  console.log(
    '[APK Config] AndroidManifest.xml weli lama abuurin. Marka hore orod: npx cap add android'
  );
  process.exit(0);
}

let xml = fs.readFileSync(manifestPath, 'utf8');

const requiredPermissions = [
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
];

const missingTags = requiredPermissions
  .filter((perm) => !xml.includes(perm))
  .map((perm) => `    <uses-permission android:name="${perm}" />`);

if (missingTags.length > 0) {
  const injection = `\n    <!-- Ogolaanshaha GPS & Khariidadda GIS -->\n${missingTags.join(
    '\n'
  )}\n    <uses-feature android:name="android.hardware.location.gps" android:required="false" />\n`;

  if (xml.includes('<application')) {
    xml = xml.replace('<application', `${injection}\n    <application`);
  } else if (xml.includes('</manifest>')) {
    xml = xml.replace('</manifest>', `${injection}\n</manifest>`);
  }

  fs.writeFileSync(manifestPath, xml, 'utf8');
  console.log(
    `[APK Config] Lagu daray ${missingTags.length} ogolaansho (GPS & Internet) gudaha AndroidManifest.xml.`
  );
} else {
  console.log(
    '[APK Config] Dhammaan ogolaanshaha GPS & Internet hore ayay ugu jireen AndroidManifest.xml.'
  );
}
