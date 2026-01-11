import { RateLimiter } from "@/utils/RateLimiter";
import protobuf from "protobufjs/light";

// Protobuf descriptors for Spotify's extended metadata API
const extendedMetadataJsonDescriptor = {
  nested: {
    Message: {
      fields: {
        header: { type: "Header", id: 1 },
        request: { type: "Request", id: 2, rule: "repeated" },
      },
    },
    Header: {
      fields: {
        country: { type: "string", id: 1 },
        catalogue: { type: "string", id: 2 },
        task_id: { type: "bytes", id: 3 },
      },
    },
    Request: {
      fields: {
        entity_uri: { type: "string", id: 1 },
        query: { type: "Query", id: 2 },
      },
    },
    Query: {
      fields: {
        extension_kind: { type: "uint32", id: 1 },
      },
    },
  },
};

const audioFeaturesJsonDescriptor = {
  nested: {
    Message: {
      fields: {
        header: { type: "Header", id: 1 },
        extension_kind: { type: "uint32", id: 2 },
        response: { type: "Response", id: 3, rule: "repeated" },
      },
    },
    Header: {
      fields: {
        status: { type: "uint32", id: 1 },
      },
    },
    Response: {
      fields: {
        info: { type: "ResponseInfo", id: 1 },
        track: { type: "string", id: 2 },
        attributes: { type: "AudioAttributesWrapper", id: 3, rule: "optional" },
      },
    },
    ResponseInfo: {
      fields: {
        status: { type: "uint32", id: 1 },
      },
    },
    AudioAttributesWrapper: {
      fields: {
        typestr: { type: "string", id: 1 },
        attributes: { type: "AudioAttributes", id: 2 },
      },
    },
    AudioAttributes: {
      fields: {
        bpm: { type: "double", id: 1 },
        key: { type: "Key", id: 2 },
      },
    },
    Key: {
      fields: {
        key: { type: "string", id: 1 },
        majorMinor: { type: "uint32", id: 2 },
        camelot: { type: "CamelotKey", id: 3 },
      },
    },
    CamelotKey: {
      fields: {
        key: { type: "string", id: 1 },
        backgroundColor: { type: "string", id: 2 },
      },
    },
  },
};

const audioFeaturesRateLimiter = new RateLimiter({
  maxRequestsPerSecond: 10,
  maxRequestsPerMinute: 1000,
  circuitBreakerThreshold: 10,
  circuitBreakerResetMs: 30000,
  requestTimeoutMs: 15000,
});

export interface AudioFeatures {
  bpm: number;
  key: string;
  mode: number; // 1 = major, 2 = minor
  camelotKey?: string;
}

class AudioFeaturesService {
  private extendedMetadataRequest: protobuf.Type | null = null;
  private audioFeaturesResponse: protobuf.Type | null = null;
  private country: string = "US";
  private catalogue: string = "premium";
  private initialized: boolean = false;

  private getProtobufTypes() {
    if (!this.extendedMetadataRequest) {
      this.extendedMetadataRequest = protobuf.Root.fromJSON(
        extendedMetadataJsonDescriptor
      ).lookupType("Message");
      this.audioFeaturesResponse = protobuf.Root.fromJSON(
        audioFeaturesJsonDescriptor
      ).lookupType("Message");
    }
    return {
      extendedMetadataRequest: this.extendedMetadataRequest,
      audioFeaturesResponse: this.audioFeaturesResponse,
    };
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const productStateValues =
        await Spicetify.Platform.ProductStateAPI.getValues();
      this.country = productStateValues["country"] ?? "US";
      this.catalogue = productStateValues["catalogue"] ?? "premium";
      this.initialized = true;
    } catch (error) {
      console.error(
        "AudioFeaturesService: Failed to init product state",
        error
      );
      this.initialized = true; // Continue with defaults
    }
  }

  private async getExtendedMetadata(
    entityUris: string[],
    extensionKind: number
  ): Promise<Uint8Array> {
    const { extendedMetadataRequest } = this.getProtobufTypes();
    if (!extendedMetadataRequest) {
      throw new Error("Protobuf types not initialized");
    }

    const taskId = new Uint8Array(16);
    crypto.getRandomValues(taskId);

    const payload = extendedMetadataRequest
      .encode({
        header: {
          country: this.country,
          catalogue: this.catalogue,
          task_id: taskId,
        },
        request: entityUris.map((entityUri) => ({
          entity_uri: entityUri,
          query: { extension_kind: extensionKind },
        })),
      })
      .finish();

    const accessToken =
      Spicetify.Platform.AuthorizationAPI.getState().token.accessToken;

    const resp = await fetch(
      "https://spclient.wg.spotify.com/extended-metadata/v0/extended-metadata",
      {
        method: "POST",
        body: payload,
        headers: {
          "Content-Type": "application/protobuf",
          Authorization: `Bearer ${accessToken}`,
          "Spotify-App-Version": Spicetify.Platform.version,
          "App-Platform": Spicetify.Platform.PlatformData.app_platform,
        },
      }
    );

    if (!resp.ok) {
      throw new Error(`Extended metadata request failed: ${resp.status}`);
    }

    return new Uint8Array(await resp.arrayBuffer());
  }

  /**
   * Fetch audio features (BPM, key, mode) for one or more tracks
   * @param trackIds Array of Spotify track IDs (not URIs)
   */
  async getAudioFeatures(
    trackIds: string[]
  ): Promise<(AudioFeatures | null)[]> {
    await this.init();

    const { audioFeaturesResponse } = this.getProtobufTypes();
    if (!audioFeaturesResponse) {
      throw new Error("Protobuf types not initialized");
    }

    // Create a unique key for this batch of track IDs
    const cacheKey = `audioFeatures:${trackIds.sort().join(",")}`;

    return audioFeaturesRateLimiter.execute(cacheKey, async () => {
      const trackUris = trackIds.map((id) => `spotify:track:${id}`);

      // Extension kind 222 = audio features
      const buf = await this.getExtendedMetadata(trackUris, 222);
      const msg = audioFeaturesResponse.decode(buf) as any;

      return msg.response.map((resp: any) => {
        if (!resp.attributes?.attributes) return null;

        const attributes = resp.attributes.attributes;
        return {
          bpm: Math.round(attributes.bpm),
          key: attributes.key?.key || "Unknown",
          mode: attributes.key?.majorMinor || 0,
          camelotKey: attributes.key?.camelot?.key,
        };
      });
    });
  }

  /**
   * Fetch BPM for a single track
   * @param trackId Spotify track ID (not URI)
   */
  async getBpm(trackId: string): Promise<number | null> {
    // Use rate limiter with track-specific key for deduplication
    return audioFeaturesRateLimiter.execute(`getBpm:${trackId}`, async () => {
      try {
        const [features] = await this.getAudioFeaturesInternal([trackId]);
        return features?.bpm ?? null;
      } catch (error) {
        console.error("AudioFeaturesService: Failed to get BPM", error);
        throw error; // Re-throw for rate limiter error tracking
      }
    });
  }

  /**
   * Internal method that does the actual fetch (called by rate limiter)
   */
  private async getAudioFeaturesInternal(
    trackIds: string[]
  ): Promise<(AudioFeatures | null)[]> {
    await this.init();

    const { audioFeaturesResponse } = this.getProtobufTypes();
    if (!audioFeaturesResponse) {
      throw new Error("Protobuf types not initialized");
    }

    const trackUris = trackIds.map((id) => `spotify:track:${id}`);

    // Extension kind 222 = audio features
    const buf = await this.getExtendedMetadata(trackUris, 222);
    const msg = audioFeaturesResponse.decode(buf) as any;

    return msg.response.map((resp: any) => {
      if (!resp.attributes?.attributes) return null;

      const attributes = resp.attributes.attributes;
      return {
        bpm: Math.round(attributes.bpm),
        key: attributes.key?.key || "Unknown",
        mode: attributes.key?.majorMinor || 0,
        camelotKey: attributes.key?.camelot?.key,
      };
    });
  }

  /**
   * Fetch BPM for a single track by URI
   * @param trackUri Spotify track URI (spotify:track:xxx)
   */
  async getBpmFromUri(trackUri: string): Promise<number | null> {
    if (trackUri.startsWith("spotify:local:")) {
      return null;
    }

    const trackId = trackUri.split(":").pop();
    if (!trackId) return null;

    return this.getBpm(trackId);
  }
}

export const audioFeaturesService = new AudioFeaturesService();
export { audioFeaturesRateLimiter };
