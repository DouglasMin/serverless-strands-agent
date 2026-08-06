import type { UserLocation } from "./types";

const ROUTE_WORDS = [
  "route",
  "directions",
  "how do i get",
  "how to get",
  "navigate",
  "navigation",
  "driving",
  "walking",
  "transit",
  "commute",
  "get to",
  "가는",
  "경로",
  "길찾기",
  "어떻게 가",
  "어디까지"
];

export function promptLikelyNeedsLocation(prompt: string): boolean {
  const value = prompt.toLowerCase();
  return ROUTE_WORDS.some((word) => value.includes(word));
}

export function getCurrentLocation(): Promise<UserLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not available in this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: Date.now()
        });
      },
      (error) => reject(new Error(error.message)),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}
