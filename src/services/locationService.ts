import * as Location from 'expo-location';

export type AlertLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  /** Nome legível do local (rua, bairro, cidade...) */
  placeName: string;
};

function formatPlaceName(place: Location.LocationGeocodedAddress): string {
  const streetLine = [place.street, place.streetNumber].filter(Boolean).join(', ');
  const parts = [
    streetLine || place.name,
    place.district || place.subregion,
    place.city,
    place.region,
  ].filter((part): part is string => !!part && part.trim().length > 0);

  // remove duplicados consecutivos
  const unique: string[] = [];
  for (const part of parts) {
    if (unique[unique.length - 1]?.toLowerCase() !== part.toLowerCase()) {
      unique.push(part);
    }
  }

  return unique.join(' · ') || 'Localização obtida';
}

async function withPlaceName(
  latitude: number,
  longitude: number,
  accuracy: number | null
): Promise<AlertLocation> {
  let placeName = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (results[0]) {
      placeName = formatPlaceName(results[0]);
    }
  } catch {
    // mantém coordenadas como fallback
  }

  return { latitude, longitude, accuracy, placeName };
}

export async function requestLocationPermission(): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return true;

  const requested = await Location.requestForegroundPermissionsAsync();
  return requested.granted;
}

export async function getAlertLocation(): Promise<AlertLocation | null> {
  try {
    const granted = await requestLocationPermission();
    if (!granted) return null;

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return withPlaceName(
      position.coords.latitude,
      position.coords.longitude,
      position.coords.accuracy ?? null
    );
  } catch {
    try {
      const last = await Location.getLastKnownPositionAsync();
      if (!last) return null;
      return withPlaceName(
        last.coords.latitude,
        last.coords.longitude,
        last.coords.accuracy ?? null
      );
    } catch {
      return null;
    }
  }
}
