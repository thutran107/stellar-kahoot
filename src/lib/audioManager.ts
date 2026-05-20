import { Howl, Howler } from 'howler';

const FADE_MS = 500;

const sounds = {
  lobby:     new Howl({ src: ['/audio/lobby.ogg'],     loop: true,  volume: 0 }),
  ambient:   new Howl({ src: ['/audio/ambient.ogg'],   loop: true,  volume: 0 }),
  countdown: new Howl({ src: ['/audio/countdown.ogg'], loop: true,  volume: 0 }),
  urgent:    new Howl({ src: ['/audio/urgent.ogg'],    loop: true,  volume: 0 }),
  timesup:   new Howl({ src: ['/audio/timesup.ogg'],   loop: false, volume: 1 }),
  correct:   new Howl({ src: ['/audio/correct.mp3'],   loop: false, volume: 1 }),
  fanfare:   new Howl({ src: ['/audio/fanfare.ogg'],   loop: false, volume: 1 }),
  podium:    new Howl({ src: ['/audio/podium.ogg'],    loop: true,  volume: 0 }),
};

export type SoundKey = keyof typeof sounds;

export function fadeIn(key: SoundKey, duration = FADE_MS) {
  const sound = sounds[key];
  if (!sound.playing()) sound.play();
  sound.fade(sound.volume(), 1, duration);
}

export function fadeOut(key: SoundKey, duration = FADE_MS) {
  const sound = sounds[key];
  const id = (sound as any)._sounds?.[0]?._id as number | undefined;
  sound.fade(sound.volume(), 0, duration);
  setTimeout(() => (id !== undefined ? sound.stop(id) : sound.stop()), duration + 50);
}

export function crossfade(from: SoundKey, to: SoundKey, duration = FADE_MS) {
  fadeOut(from, duration);
  fadeIn(to, duration);
}

export function play(key: SoundKey, onend?: () => void) {
  const sound = sounds[key];
  sound.off('end');
  if (onend) sound.once('end', onend);
  sound.play();
}

export function stopAll(duration = 100) {
  Object.values(sounds).forEach(sound => {
    if (sound.playing()) {
      const id = (sound as any)._sounds?.[0]?._id as number | undefined;
      sound.fade(sound.volume(), 0, duration);
      setTimeout(() => (id !== undefined ? sound.stop(id) : sound.stop()), duration + 50);
    }
  });
}

export function setGlobalMute(muted: boolean) {
  Howler.mute(muted);
}
