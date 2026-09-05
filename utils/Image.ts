import * as MediaLibrary from 'expo-media-library';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { Alert } from 'react-native';

export const downloadAndSaveImage = async (imageUrl: string) => {
  try {
    const file = await File.downloadFileAsync(
      imageUrl,
      new File(Paths.document, `${new Date().getTime()}.jpg`)
    );
    await saveFile(file.uri);
  } catch (err) {
    console.log('FS Err: ', err);
  }
};

const saveFile = async (fileUri: string) => {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status === 'granted') {
    try {
      const asset = await MediaLibrary.createAssetAsync(fileUri);
      const album = await MediaLibrary.getAlbumAsync('Download');
      if (album == null) {
        const result = await MediaLibrary.createAlbumAsync('Download', asset, false);
        if (result) {
          Alert.alert('Image saved to Photos');
        }
      } else {
        const result = await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
        if (result) {
          Alert.alert('Image saved to Photos');
        }
      }
    } catch (err) {
      console.log('Save err: ', err);
    }
  } else if (status === 'denied') {
    Alert.alert('please allow permissions to download');
  }
};

export const copyImageToClipboard = async (imageUrl: string) => {
  try {
    const file = await File.downloadFileAsync(
      imageUrl,
      new File(Paths.cache, `${new Date().getTime()}.jpg`)
    );
    const base64 = await file.base64();
    await Clipboard.setImageAsync(base64);
  } catch (err) {
    console.log('FS Err: ', err);
  }
};

export const shareImage = async (imageUrl: string) => {
  Sharing.shareAsync(imageUrl);
};