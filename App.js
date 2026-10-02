import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import * as DocumentPicker from 'expo-document-picker';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { createVideoPlayer, useVideoPlayer, VideoView } from 'expo-video';

const ARTWORK_PALETTES = [
  ['#D56549', '#873E39'],
  ['#55877A', '#2C554D'],
  ['#C28C4B', '#8B5739'],
  ['#65748C', '#38495C'],
];

const titleFromFile = (name) => name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');

const formatVideoTime = (seconds) => {
  const totalSeconds = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  const clock = `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${clock}` : `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
};

const createVideoThumbnail = async (uri) => {
  const player = createVideoPlayer(uri);
  try {
    const [thumbnail] = await player.generateThumbnailsAsync(1, { maxWidth: 480 });
    return thumbnail || null;
  } catch {
    return null;
  } finally {
    player.release();
  }
};

const MediaArtwork = ({ colors, video = false, style, iconSize = 22, children }) => (
  <LinearGradient colors={colors} style={[styles.mediaArtwork, style]}>
    {children || <MaterialCommunityIcons name={video ? 'movie-open-outline' : 'music-note'} size={iconSize} color="#FFFFFF" />}
  </LinearGradient>
);

export default function App() {
  const [section, setSection] = useState('video');
  const [query, setQuery] = useState('');
  const [videos, setVideos] = useState([]);
  const [activeVideoId, setActiveVideoId] = useState(null);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [selectedVideoIds, setSelectedVideoIds] = useState(new Set());

  const videoPlayer = useVideoPlayer(null, (player) => {
    player.staysActiveInBackground = true;
    player.timeUpdateEventInterval = 0.5;
  });
  const activeVideo = videos.find((video) => video.id === activeVideoId) || null;
  const playbackVideos = useMemo(() => {
    const selectedVideos = videos.filter((video) => selectedVideoIds.has(video.id));
    return selectedVideos.length > 0 ? selectedVideos : videos;
  }, [selectedVideoIds, videos]);
  const activePlaybackVideoIndex = playbackVideos.findIndex((video) => video.id === activeVideoId);
  const videoPosition = activePlaybackVideoIndex < 0
    ? 'PREVIEW'
    : `${String(activePlaybackVideoIndex + 1).padStart(2, '0')} / ${String(playbackVideos.length).padStart(2, '0')}`;

  useEffect(() => {
    const timeSubscription = videoPlayer.addListener('timeUpdate', ({ currentTime }) => {
      setVideoCurrentTime(currentTime);
    });
    const sourceSubscription = videoPlayer.addListener('sourceLoad', ({ duration }) => {
      setVideoDuration(duration);
    });
    const sourceChangeSubscription = videoPlayer.addListener('sourceChange', () => {
      setVideoCurrentTime(0);
      setVideoDuration(0);
    });

    return () => {
      timeSubscription.remove();
      sourceSubscription.remove();
      sourceChangeSubscription.remove();
    };
  }, [videoPlayer]);

  useEffect(() => {
    if (section !== 'video') videoPlayer.pause();
  }, [section, videoPlayer]);

  const visibleVideos = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return videos;
    return videos.filter((video) => `${video.title} ${video.subtitle}`.toLowerCase().includes(normalizedQuery));
  }, [query, videos]);

  const playVideo = async (video) => {
    setSection('video');
    setActiveVideoId(video.id);
    try {
      await videoPlayer.replaceAsync(video.uri);
      videoPlayer.play();
    } catch {
      Alert.alert('Unable to play video', 'Check your connection and try again.');
    }
  };

  const stepVideo = (offset) => {
    if (playbackVideos.length === 0) return;
    const currentIndex = playbackVideos.findIndex((video) => video.id === activeVideoId);
    const baseIndex = currentIndex < 0 ? 0 : currentIndex;
    const nextIndex = (baseIndex + offset + playbackVideos.length) % playbackVideos.length;
    void playVideo(playbackVideos[nextIndex]);
  };

  const removeVideo = (videoId) => {
    setVideos((current) => current.filter((video) => video.id !== videoId));
    setSelectedVideoIds((current) => {
      const updated = new Set(current);
      updated.delete(videoId);
      return updated;
    });
    if (videoId === activeVideoId) {
      videoPlayer.pause();
      setActiveVideoId(null);
    }
  };

  const toggleVideoSelection = (videoId) => {
    setSelectedVideoIds((current) => {
      const updated = new Set(current);
      if (updated.has(videoId)) updated.delete(videoId);
      else updated.add(videoId);
      return updated;
    });
  };

  const playSelectedVideos = () => {
    if (selectedVideoIds.size > 0 && playbackVideos.length > 0) {
      void playVideo(playbackVideos[0]);
    }
  };

  const closeVideoPreview = () => {
    videoPlayer.pause();
    setActiveVideoId(null);
  };

  const advanceVideo = useEffectEvent(() => {
    if (playbackVideos.length < 2) return;
    const currentIndex = playbackVideos.findIndex((video) => video.id === activeVideoId);
    if (currentIndex < 0 || currentIndex === playbackVideos.length - 1) return;
    void playVideo(playbackVideos[currentIndex + 1]);
  });

  useEffect(() => {
    const subscription = videoPlayer.addListener('playToEnd', advanceVideo);
    return () => subscription.remove();
  }, [videoPlayer]);

  const importMedia = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'video/*',
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled) return;
      setQuery('');

      const importedVideos = [];
      result.assets.forEach((asset, index) => {
        const isVideo = asset.mimeType?.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(asset.name);
        if (!isVideo) return;
        const item = {
          id: `local-${Date.now()}-${index}`,
          title: titleFromFile(asset.name),
          artist: 'On this device',
          duration: '--:--',
          uri: asset.uri,
          colors: ARTWORK_PALETTES[index % ARTWORK_PALETTES.length],
        };
        importedVideos.push({ ...item, subtitle: 'On this device', thumbnail: null });
      });

      if (importedVideos.length) {
        setVideos((current) => [...importedVideos, ...current]);
        for (const video of importedVideos) {
          const thumbnail = await createVideoThumbnail(video.uri);
          if (thumbnail) {
            setVideos((current) => current.map((queuedVideo) => (
              queuedVideo.id === video.id ? { ...queuedVideo, thumbnail } : queuedVideo
            )));
          }
        }
      }
    } catch {
      Alert.alert('Could not open videos', 'Choose one or more video files and try again.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.paper} />
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <View style={styles.brandLockup}>
            <View style={styles.brandMark}><MaterialCommunityIcons name="play" size={16} color={COLORS.paper} /></View>
            <Text style={styles.brand}>SIDE A</Text>
          </View>
            {videos.length > 0 && (
              <Pressable style={styles.importButton} onPress={importMedia} accessibilityLabel="Import videos">
                <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
                <Text style={styles.importLabel}>ADD VIDEOS</Text>
              </Pressable>
            )}
        </View>

        <ScrollView contentContainerStyle={[styles.scrollContent, videos.length === 0 && styles.emptyScreenScroll]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {section === 'video' && (
            <>
              {videos.length === 0 ? (
                <View style={styles.emptyLibrary}>
                  <View style={styles.emptyLibraryIcon}>
                    <MaterialCommunityIcons name="movie-open-plus-outline" size={34} color={COLORS.green} />
                  </View>
                  <Text style={styles.emptyLibraryTitle}>Your video library is empty</Text>
                  <Text style={styles.emptyLibraryDescription}>Choose videos from your device to add them to your queue.</Text>
                  <Pressable style={styles.emptyLibraryButton} onPress={importMedia} accessibilityRole="button" accessibilityLabel="Choose videos from device">
                    <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
                    <Text style={styles.emptyLibraryButtonText}>CHOOSE VIDEOS</Text>
                  </Pressable>
                </View>
              ) : (
                <>
          <View style={styles.searchField}>
            <MaterialCommunityIcons name="magnify" size={19} color={COLORS.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Find a video"
              placeholderTextColor={COLORS.muted}
              style={styles.searchInput}
              returnKeyType="search"
              accessibilityLabel="Search media"
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} accessibilityLabel="Clear search">
                <MaterialCommunityIcons name="close-circle" size={18} color={COLORS.muted} />
              </Pressable>
            )}
          </View>

              <View style={styles.videoIntro}>
                {activeVideo && (
                  <View style={styles.videoFrame}>
                    <VideoView
                      player={videoPlayer}
                      style={styles.videoPlayer}
                      contentFit="contain"
                      nativeControls
                      fullscreenOptions={{ enable: true }}
                      allowsPictureInPicture
                    />
                    <Pressable style={styles.closePreviewButton} onPress={closeVideoPreview} hitSlop={8} accessibilityLabel="Close video preview">
                      <MaterialCommunityIcons name="close" size={19} color="#FFFFFF" />
                    </Pressable>
                    <View
                      pointerEvents="none"
                      style={styles.videoTimeOverlay}
                      accessibilityLabel={`Playback time ${formatVideoTime(videoCurrentTime)} of ${videoDuration > 0 ? formatVideoTime(videoDuration) : 'unknown'}`}
                    >
                      <Text style={styles.videoTimeCurrent}>{formatVideoTime(videoCurrentTime)}</Text>
                      <Text style={styles.videoTimeSeparator}>/</Text>
                      <Text style={styles.videoTimeDuration}>{videoDuration > 0 ? formatVideoTime(videoDuration) : '--:--'}</Text>
                    </View>
                  </View>
                )}
                {activeVideo && (
                  <View style={styles.videoScrubber}>
                    <Slider
                      value={Math.min(videoCurrentTime, videoDuration || 0)}
                      minimumValue={0}
                      maximumValue={Math.max(videoDuration, 1)}
                      onValueChange={setVideoCurrentTime}
                      onSlidingComplete={(value) => videoPlayer.seekBy(value - videoPlayer.currentTime)}
                      disabled={videoDuration <= 0}
                      minimumTrackTintColor={COLORS.accent}
                      maximumTrackTintColor={COLORS.line}
                      thumbTintColor={COLORS.accent}
                      style={styles.videoScrubberSlider}
                      accessibilityLabel="Video playback position"
                    />
                  </View>
                )}
                {activeVideo && (
                  <View style={styles.videoQueueControls}>
                    <Pressable onPress={() => stepVideo(-1)} disabled={playbackVideos.length < 2} hitSlop={8} accessibilityLabel="Previous video">
                      <MaterialCommunityIcons name="skip-previous" size={25} color={playbackVideos.length < 2 ? COLORS.muted : COLORS.ink} />
                    </Pressable>
                    <Pressable onPress={() => videoPlayer.seekBy(-10)} hitSlop={8} accessibilityLabel="Rewind 10 seconds">
                      <MaterialCommunityIcons name="rewind-10" size={22} color={COLORS.ink} />
                    </Pressable>
                    <Text style={styles.videoPosition}>{videoPosition}</Text>
                    <Pressable onPress={() => videoPlayer.seekBy(10)} hitSlop={8} accessibilityLabel="Forward 10 seconds">
                      <MaterialCommunityIcons name="fast-forward-10" size={22} color={COLORS.ink} />
                    </Pressable>
                    <Pressable onPress={() => stepVideo(1)} disabled={playbackVideos.length < 2} hitSlop={8} accessibilityLabel="Next video">
                      <MaterialCommunityIcons name="skip-next" size={25} color={playbackVideos.length < 2 ? COLORS.muted : COLORS.ink} />
                    </Pressable>
                  </View>
                )}
                {activeVideo && <Text style={styles.videoNowTitle} numberOfLines={1}>{activeVideo.title}</Text>}
              </View>
              <View style={styles.listHeading}>
                <View>
                  <Text style={styles.listTitle}>Queue</Text>
                  <Text style={styles.listSubtitle}>{visibleVideos.length} VIDEOS</Text>
                </View>
                <MaterialCommunityIcons name="filmstrip-box-multiple" size={22} color={COLORS.ink} />
              </View>
              <View style={styles.videoList}>
                {visibleVideos.map((video) => {
                  const selected = video.id === activeVideoId;
                  return (
                    <View key={video.id} style={styles.videoRow}>
                      <Pressable style={styles.videoRowMain} onPress={() => playVideo(video)} accessibilityRole="button" accessibilityLabel={`Play ${video.title}`} accessibilityHint="Open this video in the preview">
                        <View style={styles.videoThumb}>
                          {video.thumbnail ? (
                            <ExpoImage source={video.thumbnail} style={StyleSheet.absoluteFill} contentFit="cover" transition={180} />
                          ) : (
                            <MediaArtwork colors={video.colors} video style={StyleSheet.absoluteFill} iconSize={25} />
                          )}
                          <View style={styles.thumbPlay}><MaterialCommunityIcons name={selected ? 'check' : 'play'} size={17} color={COLORS.paper} /></View>
                        </View>
                        <View style={styles.trackCopy}>
                          <Text style={[styles.trackName, selected && styles.trackNameActive]} numberOfLines={1}>{video.title}</Text>
                          <Text style={styles.trackArtist}>{video.artist}</Text>
                        </View>
                        {selected && <MaterialCommunityIcons name="equalizer" size={22} color={COLORS.accent} />}
                      </Pressable>
                      <Pressable onPress={() => removeVideo(video.id)} hitSlop={12} style={styles.removeVideoButton} accessibilityRole="button" accessibilityLabel={`Remove ${video.title} from queue`}>
                        <MaterialCommunityIcons name="close" size={20} color={COLORS.muted} />
                      </Pressable>
                      <Pressable onPress={() => toggleVideoSelection(video.id)} hitSlop={12} style={styles.selectVideoButton} accessibilityRole="checkbox" accessibilityState={{ checked: selectedVideoIds.has(video.id) }} accessibilityLabel={selectedVideoIds.has(video.id) ? `Unselect ${video.title}` : `Select ${video.title}`}>
                        <MaterialCommunityIcons
                          name={selectedVideoIds.has(video.id) ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                          size={21}
                          color={selectedVideoIds.has(video.id) ? COLORS.accent : COLORS.muted}
                        />
                      </Pressable>
                    </View>
                  );
                })}
                {visibleVideos.length === 0 && <Text style={styles.emptyMessage}>{query ? 'No videos match that search.' : 'Your video queue is empty.'}</Text>}
              </View>
                </>
              )}
            </>
          )}
        </ScrollView>

      </View>
    </SafeAreaView>
  );
}

const COLORS = {
  paper: '#F3F6F2',
  ink: '#1D2926',
  muted: '#65716B',
  line: '#DFE6E0',
  accent: '#D6533C',
  green: '#3E7164',
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.paper },
  screen: { flex: 1, backgroundColor: COLORS.paper },
  topBar: { height: 58, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 34, height: 34, borderRadius: 12, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center' },
  brand: { color: COLORS.ink, fontSize: 14, fontWeight: '800', letterSpacing: 1.2 },
  importButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 13, borderRadius: 12, backgroundColor: COLORS.accent },
  importLabel: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 18 },
  emptyScreenScroll: { flexGrow: 1 },
  emptyLibrary: { flex: 1, minHeight: 500, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, paddingBottom: 45 },
  emptyLibraryIcon: { width: 76, height: 76, borderRadius: 24, backgroundColor: '#E7F0EB', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyLibraryTitle: { color: COLORS.ink, fontSize: 19, fontWeight: '700', textAlign: 'center' },
  emptyLibraryDescription: { maxWidth: 260, color: COLORS.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 7 },
  emptyLibraryButton: { minHeight: 48, marginTop: 22, paddingHorizontal: 17, borderRadius: 13, backgroundColor: COLORS.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  emptyLibraryButtonText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  splashScroll: { flexGrow: 1, paddingBottom: 0 },
  splashScreen: { flex: 1, minHeight: 590, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 26 },
  splashContent: { alignItems: 'center', width: '100%' },
  splashBrandLockup: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  splashMark: { width: 62, height: 62, borderRadius: 22, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center' },
  splashBrand: { color: COLORS.ink, fontSize: 27, fontWeight: '800', letterSpacing: 1.5 },
  splashEqualizer: { height: 42, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 31, marginBottom: 27 },
  splashBar: { width: 5, borderRadius: 3, backgroundColor: COLORS.green },
  splashBarShort: { height: 15 },
  splashBarMedium: { height: 27 },
  splashBarTall: { height: 39 },
  splashEyebrow: { color: COLORS.green, fontSize: 9, fontWeight: '800', letterSpacing: 1.8 },
  splashTitle: { maxWidth: 310, marginTop: 10, color: COLORS.ink, fontFamily: 'Georgia', fontSize: 27, lineHeight: 33, textAlign: 'center' },
  splashCaption: { marginTop: 8, color: COLORS.muted, fontSize: 12 },
  splashSkip: { minHeight: 44, marginTop: 25, paddingHorizontal: 15, borderRadius: 13, backgroundColor: '#E8EFEB', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  splashSkipText: { color: COLORS.green, fontSize: 12, fontWeight: '700' },
  dashboardContent: { flex: 1, paddingBottom: 24 },
  dashboardIntro: { paddingTop: 28, paddingBottom: 27 },
  dashboardHeading: { color: COLORS.ink, fontFamily: 'Georgia', fontSize: 34, lineHeight: 39, marginTop: 10 },
  dashboardDescription: { color: COLORS.muted, fontSize: 13, marginTop: 8 },
  dashboardLibraryHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  dashboardLibraryCounts: { minHeight: 118, paddingVertical: 16, borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center' },
  dashboardCountItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5 },
  dashboardCountValue: { color: COLORS.ink, fontSize: 22, fontWeight: '700' },
  dashboardCountLabel: { color: COLORS.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  dashboardCountDivider: { width: 1, height: 54, backgroundColor: COLORS.line },
  dashboardOpenButton: { minHeight: 72, marginTop: 20, paddingHorizontal: 15, borderRadius: 17, backgroundColor: COLORS.ink, flexDirection: 'row', alignItems: 'center', gap: 12 },
  dashboardOpenIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center' },
  dashboardOpenCopy: { flex: 1 },
  dashboardOpenTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  dashboardOpenSubtitle: { color: 'rgba(255,255,255,0.65)', fontSize: 10, marginTop: 3 },
  intro: { paddingTop: 12, paddingBottom: 12 },
  introMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  eyebrow: { color: COLORS.green, fontSize: 9, fontWeight: '800', letterSpacing: 1.3 },
  itemCount: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, backgroundColor: '#E8EFEB' },
  itemCountDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.green },
  itemCountText: { color: COLORS.green, fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  mediaHeading: { color: COLORS.ink, fontFamily: 'Georgia', fontSize: 25, lineHeight: 31, marginTop: 8 },
  heading: { color: COLORS.ink, fontSize: 30, lineHeight: 34, fontFamily: 'Georgia', fontWeight: '400' },
  sectionSwitch: { height: 44, padding: 4, borderRadius: 14, backgroundColor: '#E7ECE8', flexDirection: 'row', marginBottom: 10 },
  sectionOption: { flex: 1, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  sectionOptionActive: { backgroundColor: COLORS.ink },
  sectionText: { color: COLORS.muted, fontSize: 13, fontWeight: '700' },
  sectionTextActive: { color: COLORS.paper },
  searchField: { height: 44, paddingHorizontal: 13, borderRadius: 13, borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  searchInput: { flex: 1, color: COLORS.ink, paddingVertical: 0, fontSize: 12 },
  featured: { marginBottom: 17 },
  featuredImage: { height: 188, justifyContent: 'space-between', padding: 16, overflow: 'hidden', borderRadius: 17, backgroundColor: COLORS.green },
  emptyMediaPanel: { alignItems: 'flex-start' },
  mediaArtwork: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  emptyMediaIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  featuredTopline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  featuredKicker: { color: '#F6F7F2', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  featuredBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, backgroundColor: 'rgba(15, 25, 22, 0.38)' },
  featuredBadgeText: { color: '#F6F7F2', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  featuredBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  featuredCopy: { flex: 1, paddingRight: 12 },
  featuredTitle: { color: '#FFFFFF', fontSize: 22, lineHeight: 27, fontFamily: 'Georgia' },
  featuredArtist: { color: 'rgba(255,255,255,0.78)', fontSize: 10, marginTop: 4 },
  featuredPlay: { width: 43, height: 43, borderRadius: 22, backgroundColor: COLORS.paper, alignItems: 'center', justifyContent: 'center' },
  listHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  listTitle: { color: COLORS.ink, fontSize: 18, fontWeight: '700' },
  listSubtitle: { color: COLORS.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.8, marginTop: 3 },
  trackList: { marginBottom: 8 },
  trackRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', position: 'relative', gap: 10 },
  trackRowContent: { flex: 1, minWidth: 0, minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10 },
  trackArtworkWrap: { width: 46, height: 46 },
  trackArtwork: { width: 46, height: 46, borderRadius: 10 },
  playingDot: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,25,22,0.34)', borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  playingDotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
  trackCopy: { flex: 1, minWidth: 0 },
  trackName: { color: COLORS.ink, fontSize: 12, fontWeight: '700' },
  trackNameActive: { color: COLORS.accent },
  trackArtist: { color: COLORS.muted, fontSize: 10, marginTop: 3 },
  trackDuration: { color: COLORS.muted, fontSize: 10, fontVariant: ['tabular-nums'] },
  rowRule: { height: 1, position: 'absolute', bottom: 0, left: 59, right: 0, backgroundColor: COLORS.line },
  emptyMessage: { paddingVertical: 16, color: COLORS.muted, fontSize: 12 },
  videoIntro: { paddingTop: 0, marginBottom: 5 },
  videoSectionTitle: { marginBottom: 5 },
  videoFrame: { alignSelf: 'stretch', aspectRatio: 16 / 9, borderRadius: 15, overflow: 'hidden', backgroundColor: '#101815' },
  emptyVideoFrame: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyVideoText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  videoPlayer: { width: '100%', height: '100%' },
  audioOnlyFrame: { alignItems: 'center', justifyContent: 'center', gap: 7, padding: 18 },
  audioOnlyTitle: { color: '#FFFFFF', fontSize: 18, lineHeight: 23, fontFamily: 'Georgia', textAlign: 'center' },
  audioOnlyArtist: { color: 'rgba(255,255,255,0.78)', fontSize: 11 },
  audioOnlyPlayButton: { width: 42, height: 42, borderRadius: 22, backgroundColor: COLORS.paper, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  videoModeSwitch: { height: 38, padding: 3, borderRadius: 12, backgroundColor: '#E9ECE6', flexDirection: 'row', marginTop: 9 },
  videoModeOption: { flex: 1, borderRadius: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  videoModeOptionActive: { backgroundColor: COLORS.ink },
  videoModeText: { color: COLORS.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.7 },
  videoModeTextActive: { color: COLORS.paper },
  videoQueueControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22, paddingTop: 6 },
  videoScrubber: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 4 },
  videoScrubberSlider: { width: '100%', height: 32 },
  closePreviewButton: { position: 'absolute', top: 8, right: 8, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(22,30,27,0.72)', alignItems: 'center', justifyContent: 'center' },
  videoPosition: { color: COLORS.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  videoNowTitle: { color: COLORS.ink, fontSize: 15, fontWeight: '700', marginTop: 10 },
  videoTimeOverlay: { position: 'absolute', bottom: 10, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 6, backgroundColor: 'transparent' },
  videoTimeCurrent: { color: '#FFFFFF', fontSize: 10, fontWeight: '700', fontVariant: ['tabular-nums'], textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  videoTimeSeparator: { color: 'rgba(255,255,255,0.85)', fontSize: 10, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  videoTimeDuration: { color: '#FFFFFF', fontSize: 10, fontVariant: ['tabular-nums'], textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  videoNowSubtitle: { color: COLORS.muted, fontSize: 10, marginTop: 3 },
  videoList: { marginBottom: 12 },
  videoRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 2 },
  videoRowMain: { flex: 1, minWidth: 0, minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10 },
  removeVideoButton: { width: 30, height: 36, alignItems: 'center', justifyContent: 'center' },
  selectVideoButton: { width: 36, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  playSelectedButton: { minHeight: 36, paddingHorizontal: 11, borderRadius: 18, backgroundColor: COLORS.ink, flexDirection: 'row', alignItems: 'center', gap: 4 },
  selectedVideoActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  playSelectedAudioButton: { minHeight: 36, paddingHorizontal: 10, borderRadius: 18, backgroundColor: COLORS.green, flexDirection: 'row', alignItems: 'center', gap: 4 },
  playSelectedText: { color: COLORS.paper, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  videoThumb: { width: 104, height: 60, borderRadius: 10, overflow: 'hidden', backgroundColor: COLORS.green },
  thumbPlay: { width: 30, height: 30, borderRadius: 16, backgroundColor: 'rgba(22, 30, 27, 0.75)', alignItems: 'center', justifyContent: 'center' },
  miniPlayer: { minHeight: 68, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: COLORS.line, flexDirection: 'row', alignItems: 'center' },
  miniPlayerMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  miniArtwork: { width: 36, height: 36, borderRadius: 8 },
  miniCopy: { flex: 1, minWidth: 0 },
  miniTitle: { color: COLORS.ink, fontSize: 12, fontWeight: '700' },
  miniArtist: { color: COLORS.muted, fontSize: 10, marginTop: 3 },
  miniControls: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingLeft: 10 },
  miniPlayButton: { width: 35, height: 35, borderRadius: 18, backgroundColor: COLORS.ink, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { height: 3, position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: '#E7E9E4' },
  progressFill: { height: 3, backgroundColor: COLORS.accent },
});
