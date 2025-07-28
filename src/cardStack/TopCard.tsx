import React from 'react';
import { StyleSheet, View, Image, Text } from 'react-native';

export interface TopCardProps {
  uri?: string;
  name: string;
  age: number;
}

export const TopCard: React.FC<TopCardProps> = ({ uri, name, age }) => {
  return (
    <View style={styles.container} pointerEvents="box-none">
      {uri ? (
        <Image source={{ uri }} style={styles.image} resizeMode="cover" />
      ) : (
        <View style={styles.fallback}>
          <Text style={styles.name}>{name}</Text>
          <Text>{age}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  image: {
    flex: 1,
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 24,
    fontWeight: '600',
  },
});
