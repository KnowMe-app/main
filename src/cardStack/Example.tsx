import React from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { CardStack } from './CardStack';
import { mockUsers } from './mockUsers';

export const Example: React.FC = () => {
  return (
    <SafeAreaView style={styles.container}>
      <CardStack data={mockUsers} onSwipe={console.log} onEnd={console.log} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
