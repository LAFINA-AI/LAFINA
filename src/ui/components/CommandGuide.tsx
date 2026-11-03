import React from 'react';
import {Text,TouchableOpacity,StyleSheet} from 'react-native';
import {COMMAND_GUIDE} from '../../ai/nlu/plannerConversation';
import {ToolSheet} from './tools';
import {useTheme} from '../contexts/ThemeContext';
interface Props {visible:boolean;onClose:()=>void;onSelect:(text:string)=>void;}
/** Offers tested command drafts; choosing one never sends, records or confirms it. */
export const CommandGuide=({visible,onClose,onSelect}:Props):React.JSX.Element=>{
  const {colors}=useTheme();
  return <ToolSheet visible={visible} title="Command guide" onClose={onClose}>
    <Text style={[styles.intro,{color:colors.textPrimary}]}>Ask about saved tasks and agenda, or prepare one change. Review and Confirm before saving. Choose an example to edit it.</Text>
    {COMMAND_GUIDE.map(example=><TouchableOpacity key={example.command} accessibilityRole="button" accessibilityLabel={`Use example: ${example.command}`} onPress={()=>onSelect(example.command)} style={[styles.row,{borderColor:colors.border}]}>
      <Text style={[styles.command,{color:colors.textPrimary}]}>{example.command}</Text><Text style={{color:colors.textSecondary}}>{example.explanation}</Text>
    </TouchableOpacity>)}
    <Text style={{color:colors.textSecondary}}>Read-only questions work offline. Manual Calendar controls remain available. Use exact quoted titles to change saved items: Move task "Study" to tomorrow at 8pm; Delete event "Lab"; Complete task "Study". Recurring series changes stay in Calendar. Named ringing reminders: Acknowledge reminder for task "Study"; Snooze reminder for task "Study" 10 minutes.</Text>
  </ToolSheet>;
};
const styles=StyleSheet.create({intro:{fontSize:16,lineHeight:24,marginBottom:16},row:{paddingVertical:14,borderBottomWidth:1,gap:6},command:{fontSize:16,fontWeight:'600'}});
