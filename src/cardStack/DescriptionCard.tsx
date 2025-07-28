import React from 'react';
import { StyleSheet, View, Text } from 'react-native';

interface Props {
  name: string;
  age: number;
  about?: string;
}

export const DescriptionCard: React.FC<Props> = ({ name, age, about }) => (
  <View style={styles.container} pointerEvents="none">
    <Text style={styles.name}>{name}, {age}</Text>
    {about ? <Text style={styles.about}>{about}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  name: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 8,
  },
  about: {
    fontSize: 16,
    textAlign: 'center',
  },
});
