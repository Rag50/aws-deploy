import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setPixelFormat('yuv420p');
Config.setConcurrency(4);
Config.setCodec('h264');
Config.setProResProfile('4444');
Config.setImageSequence(false);
Config.setScale(1);
Config.setEnforceAudioTrack(false);
Config.setMuted(false);
Config.setLevel('info');
Config.setBrowserExecutable(null);
Config.setChromiumOpenGlRenderer('egl');
Config.setChromiumHeadlessMode(true);
Config.setDelayRenderTimeoutInMilliseconds(120000); // Increase to 2 minutes
Config.setTimeoutInMilliseconds(120000); // Increase to 2 minutes
Config.setStillImageFormat('png');
Config.setOutputLocation('out');
Config.setPublicDir('public');
Config.setEntryPoint('remotion/index.jsx');

// Add additional configurations for better video handling
Config.setChromiumDisableWebSecurity(true);
Config.setChromiumIgnoreCertificateErrors(true); 