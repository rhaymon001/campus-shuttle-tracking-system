// Plain-language reasons for location problems, shared by every screen that uses GPS.
// Browsers only allow geolocation on https pages or on localhost, which trips people up when testing on a phone.

export const locationUnavailableReason = () => {
  if (!('geolocation' in navigator)) return 'This browser can’t share location.';
  if (!window.isSecureContext) {
    return 'Location needs a secure connection (https, or localhost). Open the app through your https link, or use http://localhost with adb reverse.';
  }
  return '';
};

export const explainLocationError = (err) => {
  if (!window.isSecureContext) return locationUnavailableReason();
  switch (err?.code) {
    case 1: return 'Location permission was denied. Allow it in your browser’s site settings to share your position.';
    case 2: return 'Couldn’t work out your position. Check that GPS is on and try again.';
    case 3: return 'Finding your location took too long. Try again.';
    default: return `Couldn’t get your location${err?.message ? `: ${err.message}` : '.'}`;
  }
};
