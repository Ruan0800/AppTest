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

function coordsOnly(
  latitude: number,
  longitude: number,
  accuracy: number | null
): AlertLocation {
  return {
    latitude,
    longitude,
    accuracy,
    placeName: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
  };
}

async function hasLocationPermission(): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync();
  return current.granted;
}

/**
 * Localização rápida para o caminho crítico do alerta:
 * - se já houver última posição, devolve na hora (sem esperar GPS novo)
 * - só espera GPS fresco (com timeout) quando não há lastKnown
 * - não faz reverse geocode
 */
export async function getQuickAlertLocation(
  timeoutMs = 800
): Promise<AlertLocation | null> {
  try {
    const granted = await hasLocationPermission();
    if (!granted) {
      // Só pede permissão se ainda não tiver — evita diálogo no caminho crítico
      // quando já foi concedida.
      const requested = await requestLocationPermission();
      if (!requested) return null;
    }

    const last = await Location.getLastKnownPositionAsync().catch(() => null);
    if (last) {
      // Atualiza GPS em background para o próximo alerta (não bloqueia).
      void Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }).catch(() => null);

      return coordsOnly(
        last.coords.latitude,
        last.coords.longitude,
        last.coords.accuracy ?? null
      );
    }

    const freshOrTimeout = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })
        .then((position) =>
          coordsOnly(
            position.coords.latitude,
            position.coords.longitude,
            position.coords.accuracy ?? null
          )
        )
        .catch(() => null),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);

    return freshOrTimeout;
  } catch {
    return null;
  }
}

/** Localização completa (GPS + nome do lugar). Usar fora do caminho crítico. */
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
