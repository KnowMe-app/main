import React from 'react';
import { StyleSheet, View, Image } from 'react-native';

interface Props {
  uri?: string;
  rotation: number;
}

export const StackedCard: React.FC<Props> = ({ uri, rotation, children }) => (
  <View style={[styles.container, { transform: [{ rotate: `${rotation}deg` }] }]}
    pointerEvents="none">
    {uri ? <Image source={{ uri }} style={styles.image} resizeMode="cover" /> : children}
  </View>
);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 12,
    backgroundColor: '#fff',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 4,
  },
  image: {
    flex: 1,
  },
});
