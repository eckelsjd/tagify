import React, { useEffect, useState } from "react";
import styles from "./TrackDetails.module.css";
import { TagCategory, TrackTag } from "@/hooks/data/useTagData";
import { formatTimestamp } from "@/utils/formatters";
import ReactStars from "react-rating-stars-component";
import { SpotifyTrack } from "@/types/SpotifyTypes";
import { Lock, LockOpen } from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faStar, faStarHalf } from "@fortawesome/free-solid-svg-icons";
import { audioFeaturesService } from "@/services/AudioFeaturesService";
import { spotifyService, TrackMetadata } from "@/services/SpotifyService";

interface TrackDetailsProps {
  displayedTrack: SpotifyTrack; // The track displayed in TrackDetails
  currentlyPlayingTrack: SpotifyTrack | null; // The currently playing track
  trackData: {
    rating: number;
    energy: number;
    bpm: number | null;
    tags: TrackTag[];
    dateCreated?: number;
    dateModified?: number;
  };
  categories: TagCategory[];
  onSetRating: (rating: number) => void;
  onSetEnergy: (energy: number) => void;
  onSetBpm: (bpm: number | null) => void;
  onRemoveTag: (
    categoryId: string,
    subcategoryId: string,
    tagId: string
  ) => void;
  activeTagFilters: string[];
  excludedTagFilters: string[];
  onToggleTagIncludeOff: (fullTagId: string) => void;
  onPlayTrack: (uri: string) => void;
  isLocked: boolean;
  onToggleLock: () => void;
  onSwitchToCurrentTrack: (track: SpotifyTrack | null) => void;
  onUpdateBpm: (trackUri: string) => Promise<number | null>;
  createTagId: (
    categoryId: string,
    subcategoryId: string,
    tagId: string
  ) => string;
}

const TrackDetails: React.FC<TrackDetailsProps> = ({
  displayedTrack,
  currentlyPlayingTrack,
  trackData,
  categories,
  activeTagFilters,
  excludedTagFilters,
  onSetRating,
  onSetEnergy,
  onSetBpm,
  onRemoveTag,
  onToggleTagIncludeOff,
  onPlayTrack,
  isLocked = false,
  onToggleLock,
  onSwitchToCurrentTrack,
  onUpdateBpm,
  createTagId,
}: TrackDetailsProps) => {
  const [contextUri, setContextUri] = useState<string | null>(null);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);
  const artistNames = displayedTrack.artists
    ? displayedTrack.artists.map((artist) => artist.name).join(", ")
    : "";
  const [albumCover, setAlbumCover] = useState<string | null>(null);
  const [isLoadingCover, setIsLoadingCover] = useState(true);
  const [trackMetadata, setTrackMetadata] = useState<
    TrackMetadata & {
      bpm: number | null;
      sourceContext: string | null;
    }
  >({
    releaseDate: "",
    trackLength: "",
    bpm: null,
    playCount: null,
    sourceContext: null,
    genres: [],
    albumCoverUrl: null,
  });
  const [isEditingBpm, setIsEditingBpm] = useState(false);
  const [editBpmValue, setEditBpmValue] = useState<string>("");
  const [isRefreshingBpm, setIsRefreshingBpm] = useState(false);

  const handleBpmClick = () => {
    setIsEditingBpm(true);
    // initialize input field with current BPM value
    const currentBpm = trackData.bpm || trackMetadata.bpm;
    setEditBpmValue(currentBpm ? currentBpm.toString() : "");
  };

  const handleBpmSave = () => {
    const numericValue = parseInt(editBpmValue.trim());
    if (editBpmValue.trim() === "") {
      onSetBpm(null);
    } else if (isNaN(numericValue) || numericValue < 1 || numericValue > 300) {
      Spicetify.showNotification("BPM must be between 1 and 300", true);
      return;
    } else {
      onSetBpm(numericValue);
    }

    setIsEditingBpm(false);
  };

  const handleBpmCancel = () => {
    setIsEditingBpm(false);
    setEditBpmValue("");
  };

  const handleBpmKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleBpmSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleBpmCancel();
    }
  };

  const handleBpmSaveMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent input blur
    handleBpmSave();
  };

  const handleBpmCancelMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent input blur
    handleBpmCancel();
  };

  const handleRefreshBpm = async () => {
    if (displayedTrack.uri.startsWith("spotify:local:")) {
      Spicetify.showNotification("Cannot fetch BPM for local files", true);
      return;
    }

    setIsRefreshingBpm(true);
    try {
      const bpm = await audioFeaturesService.getBpmFromUri(displayedTrack.uri);

      if (bpm !== null) {
        onSetBpm(bpm);
        Spicetify.showNotification(`BPM updated to ${bpm} from Spotify`);
      } else {
        Spicetify.showNotification("Could not fetch BPM from Spotify", true);
      }
    } catch (error) {
      console.error("Error refreshing BPM:", error);
      Spicetify.showNotification("Error fetching BPM from Spotify", true);
    } finally {
      setIsRefreshingBpm(false);
    }
  };

  // Fetch additional track metadata
  useEffect(() => {
    const fetchTrackMetadata = async () => {
      setIsLoadingMetadata(true);
      setIsLoadingCover(true);

      try {
        if (displayedTrack.uri.startsWith("spotify:local:")) {
          setAlbumCover(null);
          setIsLoadingCover(false);
          setTrackMetadata({
            releaseDate: "",
            trackLength: "",
            bpm: null,
            playCount: null,
            sourceContext: "Local Files",
            genres: [],
            albumCoverUrl: null,
          });
          setIsLoadingMetadata(false);
          return;
        }

        const metadata = await spotifyService.getTrackMetadata(
          displayedTrack.uri
        );

        if (metadata) {
          setAlbumCover(metadata.albumCoverUrl);
          setIsLoadingCover(false);

          // Get context info from player if available
          let sourceContext: string | null = null;
          if (Spicetify.Player?.data?.context?.uri) {
            const playerContextUri = Spicetify.Player.data.context.uri;
            setContextUri(playerContextUri);

            const parts = playerContextUri.split(":");
            if (parts.length >= 2) {
              const contextType = parts[1];

              if (contextType === "collection" && parts.includes("tracks")) {
                sourceContext = "Liked Songs";
              } else if (contextType === "user") {
                sourceContext = "Liked Songs";
              } else if (contextType === "album") {
                sourceContext = displayedTrack.album.name;
              } else if (contextType === "artist") {
                sourceContext = artistNames
                  ? artistNames.split(",")[0]
                  : "Artist";
              } else if (contextType === "playlist") {
                // Use service for playlist name (rate-limited)
                sourceContext = await spotifyService.getContextName(
                  playerContextUri
                );
              }
            }
          }

          // Auto-fetch BPM if not already known
          let bpm: number | null = trackData.bpm || null;
          if (!bpm) {
            try {
              bpm = await audioFeaturesService.getBpmFromUri(
                displayedTrack.uri
              );
            } catch (error) {
              console.error("Error auto-fetching BPM:", error);
            }
          }

          setTrackMetadata({
            ...metadata,
            bpm,
            sourceContext,
          });
        } else {
          setAlbumCover(null);
          setIsLoadingCover(false);
          setTrackMetadata({
            releaseDate: "",
            trackLength: "",
            bpm: null,
            playCount: null,
            sourceContext: null,
            genres: [],
            albumCoverUrl: null,
          });
        }
      } catch (error) {
        console.error("Error fetching track metadata:", error);
        setAlbumCover(null);
        setIsLoadingCover(false);
        setTrackMetadata({
          releaseDate: "",
          trackLength: "",
          bpm: null,
          playCount: null,
          sourceContext: null,
          genres: [],
          albumCoverUrl: null,
        });
      } finally {
        setIsLoadingMetadata(false);
      }
    };

    if (displayedTrack.uri) {
      fetchTrackMetadata();
    }
  }, [displayedTrack.uri, displayedTrack.album.name, artistNames]);

  const handlePlayTrack = () => {
    if (displayedTrack.uri) {
      onPlayTrack(displayedTrack.uri);
    }
  };

  // Find tag name by ids
  const findTagInfo = (
    categoryId: string,
    subcategoryId: string,
    tagId: string
  ) => {
    const category = categories.find((c) => c.id === categoryId);
    if (!category) return null;

    const subcategory = category.subcategories.find(
      (s) => s.id === subcategoryId
    );
    if (!subcategory) return null;

    const tag = subcategory.tags.find((t) => t.id === tagId);
    if (!tag) return null;

    return {
      categoryName: category.name,
      subcategoryName: subcategory.name,
      tagName: tag.name,
      tagOrder: subcategory.tags.findIndex((t) => t.id === tagId),
    };
  };

  // Group tags by category and maintain original order
  const organizeTagsByCategory = () => {
    const groupedTags: {
      [categoryId: string]: {
        categoryName: string;
        categoryOrder: number;
        subcategories: {
          [subcategoryId: string]: {
            subcategoryName: string;
            subcategoryOrder: number;
            tags: {
              id: string;
              name: string;
              order: number;
            }[];
          };
        };
      };
    } = {};

    // First get all categories with their order in the original array
    categories.forEach((category, categoryIndex) => {
      groupedTags[category.id] = {
        categoryName: category.name,
        categoryOrder: categoryIndex,
        subcategories: {},
      };

      // Initialize subcategories with their order
      category.subcategories.forEach((subcategory, subcategoryIndex) => {
        groupedTags[category.id].subcategories[subcategory.id] = {
          subcategoryName: subcategory.name,
          subcategoryOrder: subcategoryIndex,
          tags: [],
        };
      });
    });

    // Now add the tags from the track data
    trackData.tags.forEach((tag) => {
      const tagInfo = findTagInfo(tag.categoryId, tag.subcategoryId, tag.tagId);
      if (!tagInfo) return;

      // Add the tag with its original order to ensure proper sorting later
      groupedTags[tag.categoryId].subcategories[tag.subcategoryId].tags.push({
        id: tag.tagId,
        name: tagInfo.tagName,
        order: tagInfo.tagOrder,
      });
    });

    // For each subcategory, sort tags by their original order
    Object.values(groupedTags).forEach((category) => {
      Object.values(category.subcategories).forEach((subcategory) => {
        subcategory.tags.sort((a, b) => a.order - b.order);
      });
    });

    return groupedTags;
  };

  const groupedTags = organizeTagsByCategory();

  const handleRemoveEnergy = () => {
    onSetEnergy(0);
  };

  // Navigation functions
  const navigateToAlbum = async (): Promise<void> => {
    try {
      if (displayedTrack.uri.startsWith("spotify:local:")) {
        Spicetify.Platform.History.push("/collection/local-files");
        return;
      }

      // First check if we have album URI from player data
      if (Spicetify.Player.data?.item?.uri === displayedTrack.uri) {
        const albumUri = Spicetify.Player.data.item.album?.uri;
        if (albumUri) {
          const albumId = albumUri.split(":").pop();
          if (albumId) {
            Spicetify.Platform.History.push(`/album/${albumId}`);
            return;
          }
        }
      }

      // Otherwise use SpotifyService
      const albumUri = await spotifyService.getTrackAlbumUri(
        displayedTrack.uri
      );
      if (albumUri) {
        const albumId = albumUri.split(":").pop();
        if (albumId) {
          Spicetify.Platform.History.push(`/album/${albumId}`);
          return;
        }
      }

      Spicetify.showNotification("Couldn't navigate to album", true);
    } catch (error) {
      console.error("Error navigating to album:", error);
      Spicetify.showNotification("Error navigating to album", true);
    }
  };

  const navigateToArtist = async (artistName: string): Promise<void> => {
    try {
      if (displayedTrack.uri.startsWith("spotify:local:")) {
        Spicetify.showNotification(
          "Cannot navigate to artist for local files",
          true
        );
        return;
      }

      // Use SpotifyService to get artist data
      const artists = await spotifyService.getTrackArtists(displayedTrack.uri);
      const artist = artists.find((a) => a.name === artistName);

      if (artist?.uri) {
        const artistId = artist.uri.split(":").pop();
        if (artistId) {
          Spicetify.Platform.History.push(`/artist/${artistId}`);
          return;
        }
      }

      // Fallback to search
      Spicetify.Platform.History.push(
        `/search/${encodeURIComponent(artistName)}/artists`
      );
    } catch (error) {
      console.error("Error navigating to artist:", error);
      Spicetify.Platform.History.push(
        `/search/${encodeURIComponent(artistName)}/artists`
      );
    }
  };

  // Navigate to context (playlist, album, etc.)
  const navigateToContext = (): void => {
    if (trackMetadata.sourceContext == "Local Files") {
      Spicetify.Platform.History.push("/collection/local-files");
      return;
    }

    if (!contextUri) {
      Spicetify.showNotification("No context available to navigate to", true);
      return;
    }

    try {
      const parts = contextUri.split(":");
      if (parts.length < 3) {
        Spicetify.showNotification("Invalid context URI", true);
        return;
      }

      const contextType = parts[1];
      const contextId = parts[2];

      switch (contextType) {
        case "playlist":
          Spicetify.Platform.History.push(`/playlist/${contextId}`);
          break;
        case "album":
          Spicetify.Platform.History.push(`/album/${contextId}`);
          break;
        case "artist":
          Spicetify.Platform.History.push(`/artist/${contextId}`);
          break;
        case "show":
          Spicetify.Platform.History.push(`/show/${contextId}`);
          break;
        case "collection":
          // Special case for Liked Songs
          if (parts.includes("tracks")) {
            Spicetify.Platform.History.push("/collection/tracks");
          }
          break;
        case "user":
          // For user context, likely Liked Songs
          Spicetify.Platform.History.push("/collection/tracks");
          break;
        default:
          console.log(`Unsupported context type: ${contextType}`);
          Spicetify.showNotification(`Cannot navigate to ${contextType}`, true);
      }
    } catch (error) {
      console.error("Error navigating to context:", error);
      Spicetify.showNotification("Error navigating to context", true);
    }
  };

  const handleEnergyInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    onSetEnergy(value);
  };

  const handleEnergyClick = (e: React.MouseEvent<HTMLInputElement>) => {
    // Get the clicked position and calculate the corresponding energy value
    const sliderElement = e.currentTarget;
    const rect = sliderElement.getBoundingClientRect();
    const clickPosition = e.clientX - rect.left;
    const sliderWidth = rect.width;
    const percentage = clickPosition / sliderWidth;

    // Calculate energy value (1-10)
    const min = 1;
    const max = 10;
    let energy = Math.round(min + percentage * (max - min));

    energy = Math.max(min, Math.min(max, energy));

    onSetEnergy(energy);
  };

  return (
    <div className={styles.container}>
      <div className={styles.lockControlContainer}>
        {isLocked &&
          currentlyPlayingTrack &&
          currentlyPlayingTrack.uri !== displayedTrack.uri && (
            <button
              className={styles.switchTrackButton}
              onClick={() => {
                onSwitchToCurrentTrack(currentlyPlayingTrack);
              }}
              title="Switch to currently playing track"
            >
              <span className={styles.buttonIcon}></span>
              Switch to current
            </button>
          )}

        <button
          className={`${styles.lockButton} ${
            isLocked ? styles.locked : styles.unlocked
          }`}
          onClick={onToggleLock}
          title={
            isLocked
              ? "Unlock to follow currently playing track"
              : "Lock to this track"
          }
        >
          {isLocked ? (
            <Lock size={16} strokeWidth={1.25} absoluteStrokeWidth />
          ) : (
            <LockOpen size={16} strokeWidth={1.25} absoluteStrokeWidth />
          )}
        </button>
      </div>
      <div className={styles.contentLayout}>
        {/* Left side - Track info with album art */}
        <div className={styles.trackInfoContainer}>
          {/* Wrap album cover and warning in a column container */}
          <div className={styles.albumSection}>
            <div className={styles.albumCoverContainer}>
              <div
                className={styles.albumCoverClickable}
                onClick={() => navigateToAlbum()}
                title={
                  displayedTrack.uri?.startsWith("spotify:local:")
                    ? "Go to Local Files"
                    : "Go to album"
                }
              >
                {isLoadingCover ? (
                  <div className={styles.albumCoverPlaceholder}>
                    <div className={styles.albumCoverLoading}></div>
                  </div>
                ) : albumCover ? (
                  <img
                    src={albumCover}
                    alt={`${displayedTrack.album?.name || "Album"} cover`}
                    className={styles.albumCover}
                  />
                ) : (
                  <div className={styles.albumCoverPlaceholder}>
                    <span className={styles.albumCoverIcon}>♫</span>
                  </div>
                )}
              </div>
              <button
                className={styles.playButton}
                onClick={handlePlayTrack}
                title={"Play this track"}
              >
                {"Play"}
              </button>
            </div>
          </div>

          <div className={styles.trackInfo}>
            <h2
              className={styles.trackTitle}
              onClick={() => navigateToAlbum()}
              title={
                displayedTrack.uri?.startsWith("spotify:local:")
                  ? "Go to Local Files"
                  : "Go to album"
              }
            >
              {displayedTrack.name || "Unknown Track"}
              {displayedTrack.uri?.startsWith("spotify:local:") && (
                <span
                  style={{ fontSize: "0.8em", opacity: 0.7, marginLeft: "6px" }}
                >
                  (Local)
                </span>
              )}
            </h2>
            <p className={styles.trackArtist}>
              {displayedTrack.artists && displayedTrack.artists.length > 0
                ? displayedTrack.artists.map((artist, idx, arr) => (
                    <React.Fragment key={idx}>
                      <span
                        className={`${styles.clickableArtist}`}
                        onClick={() => navigateToArtist(artist.name)}
                        title={`Go to ${artist.name}`}
                      >
                        {artist.name}
                      </span>
                      {idx < arr.length - 1 && ", "}
                    </React.Fragment>
                  ))
                : "Unknown Artist"}
            </p>
            <p className={styles.trackAlbum}>
              {displayedTrack.album?.name || "Unknown Album"}
            </p>

            {/* New Track Metadata Section */}
            <div className={styles.trackMetadata}>
              {isLoadingMetadata ? (
                <div className={styles.metadataLoading}>Loading details...</div>
              ) : (
                <>
                  <div className={styles.metadataGrid}>
                    {trackMetadata.releaseDate && (
                      <div className={styles.metadataItem}>
                        <span className={styles.metadataLabel}>Released:</span>
                        <span className={styles.metadataValue}>
                          {trackMetadata.releaseDate}
                        </span>
                      </div>
                    )}

                    {trackMetadata.trackLength && (
                      <div className={styles.metadataItem}>
                        <span className={styles.metadataLabel}>Length:</span>
                        <span className={styles.metadataValue}>
                          {trackMetadata.trackLength}
                        </span>
                      </div>
                    )}

                    <div className={styles.metadataItem}>
                      <span className={styles.metadataLabel}>BPM:</span>
                      <div className={styles.bpmContainer}>
                        {isEditingBpm ? (
                          <div className={styles.bpmEditContainer}>
                            <input
                              type="number"
                              value={editBpmValue}
                              onChange={(e) => setEditBpmValue(e.target.value)}
                              onKeyDown={handleBpmKeyDown}
                              onBlur={handleBpmCancel}
                              className={styles.bpmEditInput}
                              placeholder="Enter BPM"
                              min="1"
                              max="300"
                              autoFocus
                            />
                            <button
                              className={styles.bpmSaveButton}
                              onMouseDown={handleBpmSaveMouseDown}
                              title="Save BPM"
                            >
                              ✓
                            </button>
                            <button
                              className={styles.bpmCancelButton}
                              onMouseDown={handleBpmCancelMouseDown}
                              title="Cancel"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div className={styles.bpmDisplayContainer}>
                            <span
                              className={`${styles.metadataValue} ${styles.editableBpm}`}
                              onClick={handleBpmClick}
                              title="Click to edit BPM"
                            >
                              {trackData.bpm || trackMetadata.bpm || "Unknown"}
                            </span>

                            {!displayedTrack.uri.startsWith(
                              "spotify:local:"
                            ) && (
                              <button
                                className={styles.bpmRefreshButton}
                                onClick={handleRefreshBpm}
                                disabled={isRefreshingBpm}
                                title="Fetch latest BPM from Spotify"
                              >
                                {isRefreshingBpm ? (
                                  <span className={styles.refreshSpinner}>
                                    ⟳
                                  </span>
                                ) : (
                                  "↻"
                                )}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {trackMetadata.playCount !== null && (
                      <div className={styles.metadataItem}>
                        <span className={styles.metadataLabel}>Plays:</span>
                        <span className={styles.metadataValue}>
                          {trackMetadata.playCount.toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Separate div for source context, so it can take up full width of container */}
                  {trackMetadata.sourceContext && (
                    <div className={styles.metadataContext}>
                      <span className={styles.metadataLabel}>
                        Playing from:
                      </span>{" "}
                      <span
                        className={`${styles.metadataValue} ${styles.contextLink}`}
                        onClick={() => navigateToContext()}
                        title="Go to source"
                      >
                        {trackMetadata.sourceContext}
                      </span>
                    </div>
                  )}
                  {/* Spotify genre tags */}
                  {/* {trackMetadata.genres.length > 0 && (
                    <div className={styles.metadataGenres}>
                      <span className={styles.metadataLabel}>Genres:</span>{" "}
                      <div className={styles.genreTags}>
                        {trackMetadata.genres.map((genre, index) => (
                          <span key={index} className={styles.genreTag}>
                            {genre}
                          </span>
                        ))}
                      </div>
                    </div>
                  )} */}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right side - Controls and metadata */}
        <div className={styles.controlsContainer}>
          {/* Rating */}
          <div className={styles.controlSection}>
            <label className={styles.label}>
              Rating: {trackData.rating > 0 ? trackData.rating : ""}
            </label>
            <div className={styles.ratingContainer}>
              <div className={styles.stars} key={`stars-${trackData.rating}`}>
                <ReactStars
                  count={5}
                  value={trackData.rating || 0}
                  onChange={(newRating: number) => onSetRating(newRating)}
                  size={24}
                  isHalf={true}
                  emptyIcon={<FontAwesomeIcon icon={faStar} />}
                  halfIcon={<FontAwesomeIcon icon={faStarHalf} />}
                  fullIcon={<FontAwesomeIcon icon={faStar} />}
                  activeColor="#ffd700"
                  color="var(--spice-button-disabled)"
                />
              </div>

              {trackData.rating > 0 && (
                <button
                  className={styles.clearButton}
                  onClick={() => onSetRating(0)}
                  aria-label="Clear rating"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Energy Level */}
          <div className={styles.controlSection}>
            <label className={styles.label}>
              Energy:
              {trackData.energy > 0 && (
                <span className={styles.energyValue}>{trackData.energy}</span>
              )}
            </label>
            <div className={styles.energyContainer}>
              <input
                type="range"
                min="1"
                max="10"
                value={trackData.energy || 5}
                data-is-set={trackData.energy > 0 ? "true" : "false"}
                className={`${styles.energySlider} ${
                  trackData.energy === 0 ? styles.energySliderUnset : ""
                }`}
                onChange={handleEnergyInput}
                onClick={handleEnergyClick}
                onDoubleClick={() => {
                  // Clear on double click
                  onSetEnergy(0);
                }}
              />
              {trackData.energy > 0 && (
                <button
                  className={styles.clearButton}
                  onClick={handleRemoveEnergy}
                  aria-label="Clear energy rating"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* TAGS SECTION */}
      <div className={styles.tagsSection}>
        {/* Timestamp metadata */}
        {(trackData.dateCreated || trackData.dateModified) && (
          <div className={styles.timestampMetadata}>
            <div className={styles.timestampRow}>
              {trackData.dateCreated && (
                <div
                  className={styles.timestampItem}
                  title={
                    "Created: " +
                    new Date(trackData.dateCreated).toLocaleString()
                  }
                >
                  <span className={styles.timestampLabel}>Tagged:</span>
                  <span className={styles.timestampValue}>
                    {formatTimestamp(trackData.dateCreated, true)}
                  </span>
                </div>
              )}
              {trackData.dateModified && (
                <div
                  className={styles.timestampItem}
                  title={
                    "Last updated: " +
                    new Date(trackData.dateModified).toLocaleString()
                  }
                >
                  <span className={styles.timestampLabel}>Updated:</span>
                  <span className={styles.timestampValue}>
                    {formatTimestamp(trackData.dateModified, true)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
        {Object.values(groupedTags).every((category) =>
          Object.values(category.subcategories).every(
            (subcategory) => subcategory.tags.length === 0
          )
        ) ? (
          <p className={styles.noTags}>No tags applied</p>
        ) : (
          <div className={styles.tagCategories}>
            {/* Filter categories to only show those with tags */}
            {Object.entries(groupedTags)
              .filter(([, categoryData]) => {
                // Check if this category has any subcategories with tags
                return Object.values(categoryData.subcategories).some(
                  (subcategory) => subcategory.tags.length > 0
                );
              })
              .sort(([, a], [, b]) => a.categoryOrder - b.categoryOrder)
              .map(([categoryId, category]) => (
                <div key={categoryId} className={styles.tagCategory}>
                  <h4 className={styles.categoryName}>
                    {category.categoryName}
                  </h4>

                  {/* Only show subcategories that have tags */}
                  {Object.entries(category.subcategories)
                    .filter(([, subcategory]) => subcategory.tags.length > 0)
                    .sort(
                      ([, a], [, b]) => a.subcategoryOrder - b.subcategoryOrder
                    )
                    .map(([subcategoryId, subcategory]) => (
                      <div
                        key={subcategoryId}
                        className={styles.tagSubcategory}
                      >
                        <h5 className={styles.subcategoryName}>
                          {subcategory.subcategoryName}
                        </h5>

                        <div className={styles.tagList}>
                          {subcategory.tags.map((tag) => {
                            const fullTagId = createTagId(
                              categoryId,
                              subcategoryId,
                              tag.id
                            );

                            return (
                              <div
                                key={tag.id}
                                className={`${styles.tagItem} ${
                                  activeTagFilters.includes(fullTagId)
                                    ? styles.tagFilter
                                    : ""
                                } ${
                                  excludedTagFilters.includes(fullTagId)
                                    ? styles.tagExcluded
                                    : ""
                                }`}
                                onClick={() => onToggleTagIncludeOff(fullTagId)}
                                title={
                                  activeTagFilters.includes(fullTagId)
                                    ? `Click to remove filter for "${tag.name}"`
                                    : excludedTagFilters.includes(fullTagId)
                                    ? `Click to remove "${tag.name}" filter`
                                    : `Click to include "${tag.name}"`
                                }
                              >
                                <span className={styles.tagName}>
                                  {tag.name}
                                </span>
                                <button
                                  className={styles.removeTag}
                                  title={`Click to delete this tag`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRemoveTag(
                                      categoryId,
                                      subcategoryId,
                                      tag.id
                                    );
                                  }}
                                  aria-label={`Remove tag ${tag.name}`}
                                >
                                  ×
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TrackDetails;
