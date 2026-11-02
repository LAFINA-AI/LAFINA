import React from 'react';
import {Modal,View,Text,ScrollView,TouchableOpacity,StyleSheet} from 'react-native';
import type {CommandReview} from '../../ai/nlu/commandSession';
import {useTheme} from '../contexts/ThemeContext';
interface Props {review:CommandReview|null; onConfirm:()=>void; onCancel:()=>void;}
/** Shows the exact private proposal; cancellation returns to the editable draft. */
export const CommandReviewPanel=({review,onConfirm,onCancel}:Props):React.JSX.Element=>{
  const {colors}=useTheme();
  return <Modal visible={!!review} transparent animationType="fade" onRequestClose={onCancel}>
    <View style={styles.overlay}>
      <View style={[styles.card,{backgroundColor:colors.cardBg}]} accessibilityViewIsModal>
        <Text accessibilityRole="header" style={[styles.title,{color:colors.textPrimary}]}>Review before saving</Text>
        <ScrollView style={styles.scroll}><Text testID="command-review-summary" style={[styles.summary,{color:colors.textPrimary}]}>{review?.summary}</Text></ScrollView>
        <Text style={{color:colors.textSecondary}}>Nothing has been saved. This review expires in five minutes.</Text>
        <View style={styles.buttons}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancel review" onPress={onCancel} style={styles.button}><Text style={{color:colors.textPrimary}}>Edit draft</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Confirm command" onPress={onConfirm} style={[styles.button,{backgroundColor:colors.red}]}><Text style={{color:colors.white}}>Confirm</Text></TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>;
};
const styles=StyleSheet.create({overlay:{flex:1,justifyContent:'center',padding:24,backgroundColor:'rgba(0,0,0,0.65)'},card:{padding:22,borderRadius:20,maxHeight:'85%',gap:18},title:{fontSize:21,fontWeight:'700'},scroll:{flexGrow:0},summary:{fontSize:17,lineHeight:26},buttons:{flexDirection:'row',justifyContent:'flex-end',gap:12},button:{paddingHorizontal:20,paddingVertical:14,borderRadius:12,minHeight:48}});
