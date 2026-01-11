import { useEffect, useRef } from "react";
import { TagDataStructure } from "@/hooks/data/useTagData";
import { spotifyService } from "@/services/SpotifyService";
import { audioFeaturesService } from "@/services/AudioFeaturesService";

const TAG_DATA_KEY = "tagify:tagData";

interface UseMetadataBackfillOptions {
  enabled?: boolean;
  onComplete?: () => void;
}

/**
 * One-time backfill of missing track metadata (name, artists, bpm).
 * Runs once on mount, reads/writes directly to localStorage.
 */
export function useMetadataBackfill({
  enabled = true,
  onComplete,
}: UseMetadataBackfillOptions = {}) {
  const hasRun = useRef(false);

  useEffect(() => {
    if (!enabled || hasRun.current) return;
    hasRun.current = true;

    // Run async backfill
    runBackfill().then(() => {
      onComplete?.(); // ? optional chaining - call the function only if it exists
    });
  }, [enabled]);
}

async function runBackfill(): Promise<number> {
  // 1. Read from localStorage
  const raw = localStorage.getItem(TAG_DATA_KEY);
  if (!raw) return 0;

  let tagData: TagDataStructure;
  try {
    tagData = JSON.parse(raw);
  } catch {
    console.error("[MetadataBackfill] Failed to parse localStorage");
    return 0;
  }

  // 2. Find tracks needing backfill
  const tracksToBackfill = Object.entries(tagData.tracks).filter(
    ([uri, track]) => {
      if (uri.startsWith("spotify:local:")) return false;
      const needsName = !track.name;
      const needsArtists = !track.artists;
      const needsBpm = !track.bpm || track.bpm === null;
      return needsName || needsArtists || needsBpm;
    }
  );

  if (tracksToBackfill.length === 0) {
    return 0;
  }

  console.log(
    `[MetadataBackfill] Backfilling ${tracksToBackfill.length} tracks`
  );

  // 3. Process in batches
  const BATCH_SIZE = 10;
  let updatedCount = 0;

  for (let i = 0; i < tracksToBackfill.length; i += BATCH_SIZE) {
    const batch = tracksToBackfill.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async ([uri, track]) => {
        try {
          let updated = false;

          // Fetch metadata if needed (track title/artists)
          if (!track.name || !track.artists) {
            const info = await spotifyService.getTrack(uri);
            if (info) {
              tagData.tracks[uri].name = info.name;
              tagData.tracks[uri].artists = info.artists;
              updated = true;
            }
          }

          // Fetch BPM if needed
          if (!track.bpm || track.bpm === null) {
            const trackId = uri.split(":").pop();
            if (trackId) {
              const bpm = await audioFeaturesService.getBpm(trackId);
              if (bpm !== null) {
                tagData.tracks[uri].bpm = bpm;
                updated = true;
              }
            }
          }

          if (updated) updatedCount++;
        } catch (error) {
          console.warn(`[MetadataBackfill] Failed for ${uri}:`, error);
        }
      })
    );

    // Save progress after each batch
    localStorage.setItem(TAG_DATA_KEY, JSON.stringify(tagData));
  }

  console.log(`[MetadataBackfill] Complete. Updated ${updatedCount} tracks`);

  return updatedCount;
}
