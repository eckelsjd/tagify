class SpotifyApiService {
  /**
   * Get all track URIs in a playlist using Platform API
   */
  getAllTrackUrisInPlaylist = async (playlistId: string): Promise<string[]> => {
    try {
      const playlistUri = `spotify:playlist:${playlistId}`;
      const contents = await (
        Spicetify.Platform.PlaylistAPI as any
      ).getContents(playlistUri);

      return contents.items
        .filter((item: any) => item.uri)
        .map((item: any) => item.uri);
    } catch (error) {
      console.error("Error fetching tracks in playlist:", error);
      return [];
    }
  };

  isTrackInPlaylist = async (
    trackUri: string,
    playlistId: string
  ): Promise<boolean> => {
    try {
      const playlistUri = `spotify:playlist:${playlistId}`;
      const contents = await (
        Spicetify.Platform.PlaylistAPI as any
      ).getContents(playlistUri);

      return contents.items.some(
        (item: any) => item.uri === trackUri || item.link === trackUri
      );
    } catch (error) {
      console.error("Error checking if track is in playlist:", error);
      return false;
    }
  };

  /**
   * Get all user playlist IDs using Platform API
   */
  getAllUserPlaylists = async (): Promise<string[]> => {
    try {
      const contents = await (
        Spicetify.Platform.RootlistAPI as any
      ).getContents();

      const extractPlaylistIds = (items: any[]): string[] => {
        const ids: string[] = [];
        for (const item of items) {
          if (item.type === "playlist" && item.uri) {
            ids.push(item.uri.split(":").pop());
          } else if (item.type === "folder" && item.items) {
            ids.push(...extractPlaylistIds(item.items));
          }
        }
        return ids;
      };

      return extractPlaylistIds(contents.items || []);
    } catch (error) {
      console.error("Error fetching user playlists:", error);
      return [];
    }
  };

  /**
   * Get track count for a playlist using Platform API
   */
  getPlaylistTrackCount = async (playlistId: string): Promise<number> => {
    try {
      const playlistUri = `spotify:playlist:${playlistId}`;
      const metadata = await (
        Spicetify.Platform.PlaylistAPI as any
      ).getMetadata(playlistUri);
      return metadata?.totalLength || 0;
    } catch (error) {
      console.error("Error fetching playlist track count:", error);
      return 0;
    }
  };

  /**
   * Get track counts for multiple playlists
   */
  getPlaylistTrackCounts = async (
    playlistIds: string[]
  ): Promise<Record<string, number>> => {
    const counts: Record<string, number> = {};

    await Promise.all(
      playlistIds.map(async (playlistId) => {
        counts[playlistId] = await this.getPlaylistTrackCount(playlistId);
      })
    );

    return counts;
  };

  /**
   * Get audio features for a track (for BPM)
   * @deprecated Use audioFeaturesService.getBpm() instead
   */
  getAudioFeatures = async (
    trackId: string
  ): Promise<{ tempo: number } | null> => {
    // Delegate to AudioFeaturesService which uses protobuf API
    const { audioFeaturesService } = await import(
      "@/services/AudioFeaturesService"
    );
    const bpm = await audioFeaturesService.getBpm(trackId);
    return bpm ? { tempo: bpm } : null;
  };

  /**
   * Extract track ID from Spotify URI
   */
  extractTrackId(trackUri: string): string | null {
    if (trackUri.startsWith("spotify:local:")) {
      return null;
    }
    return trackUri.split(":").pop() || null;
  }

  /**
   * Fetch BPM for a track
   */
  fetchBpm = async (trackUri: string): Promise<number | null> => {
    const trackId = this.extractTrackId(trackUri);
    if (!trackId) return null;

    const audioFeatures = await this.getAudioFeatures(trackId);
    return audioFeatures ? Math.round(audioFeatures.tempo) : null;
  };

  /**
   * Add single track to playlist using Platform API
   */
  addTrackToSpotifyPlaylist = async (
    trackUri: string,
    playlistId: string
  ): Promise<{ success: boolean; wasAdded: boolean }> => {
    try {
      if (trackUri.startsWith("spotify:local:")) {
        return { success: true, wasAdded: false };
      }

      const playlistUri = `spotify:playlist:${playlistId}`;
      const isAlreadyInPlaylist = await this.isTrackInPlaylist(
        trackUri,
        playlistId
      );

      if (isAlreadyInPlaylist) {
        return { success: true, wasAdded: false };
      }

      await (Spicetify.Platform.PlaylistAPI as any).add(
        playlistUri,
        [trackUri],
        { after: "end" }
      );

      return { success: true, wasAdded: true };
    } catch (error) {
      console.error("Error adding track to playlist:", error);
      return { success: false, wasAdded: false };
    }
  };

  /**
   * Remove track from playlist using Platform API
   */
  removeTrackFromPlaylist = async (
    trackUri: string,
    playlistId: string
  ): Promise<boolean> => {
    try {
      const playlistUri = `spotify:playlist:${playlistId}`;
      const contents = await (
        Spicetify.Platform.PlaylistAPI as any
      ).getContents(playlistUri);

      const tracksToRemove = contents.items
        .filter((item: any) => item.uri === trackUri)
        .map((item: any) => ({ uri: item.uri, uid: item.uid }));

      if (tracksToRemove.length > 0) {
        await (Spicetify.Platform.PlaylistAPI as any).remove(
          playlistUri,
          tracksToRemove
        );
        return true;
      }

      return false;
    } catch (error) {
      console.error("Error removing track from playlist:", error);
      return false;
    }
  };
}

export const spotifyApiService = new SpotifyApiService();
