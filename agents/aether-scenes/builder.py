"""Preserve current narration and count callouts; creative descriptions are data."""
from pathlib import Path
import json,re
STYLE="Premium ultra-realistic 3D biomedical CGI movie scene, vertical 9:16, 1080x1920. Deep charcoal background, translucent ivory biological structures, restrained crimson and salmon-red accents, dramatic white rim lighting, cinematic depth of field, believable biological scale and premium scientific-film realism."
BLOCKED=re.compile(r"\b(?:callouts?|labels?|captions?|typograph\w*|watermarks?|logos?|text)\b",re.I)
def visual_text(text,script):
    # Keep decorative colors in the reference palette, preserving colors explicitly narrated.
    def color(match):
        word=match.group(0)
        return word if re.search(r'\b'+re.escape(word)+r'\b',script,re.I) else 'ivory'
    text=re.sub(r'\b(?:purple|violet|blue|cyan|green|gold|golden|yellow|orange|turquoise|rainbow)\b',color,text,flags=re.I)
    text=re.sub(r'\bbacterial nucleus\b|\bbacterium[’\x27]s nucleus\b','bacterial nucleoid region',text,flags=re.I)
    if re.search(r'\bbacteri(?:um|a|al)\b',script,re.I):
        text=re.sub(r'\bnuclear region\b','nucleoid region',text,flags=re.I)
        text=re.sub(r'\bchromatin\b','coiled genetic material',text,flags=re.I)
    text=re.sub(r'\bnanoparticle receptors\b','surface receptor proteins',text,flags=re.I)
    return text

def build_scenes(path,scenes,output_dir=None):
    source=Path(path).expanduser().resolve()
    if source.name!='scene-plan.json':raise ValueError('Use the exact current scene-plan.json path supplied by the coordinator.')
    plan=json.loads(source.read_text(encoding='utf-8-sig'))
    if plan.get('aether_scene_plan')!=1 or not isinstance(plan.get('scenes'),list):raise ValueError('Invalid current scene plan.')
    if not isinstance(scenes,list) or len(scenes)!=len(plan['scenes']):raise ValueError(f"Return exactly {len(plan['scenes'])} scene objects, one per assigned scene.")
    blocks=[];total=0
    for spec,scene in zip(plan['scenes'],scenes):
        if scene.get('scene')!=spec['scene']:raise ValueError('Scene numbers must match the supplied plan in order.')
        description=visual_text(scene.get('description','').strip(),plan.get('script',''));motion=visual_text(scene.get('motion','').strip(),plan.get('script',''));calls=scene.get('callouts',[])
        if len(description)<25 or len(motion)<20:raise ValueError('Give each scene a concrete visual description and image-to-video motion.')
        if BLOCKED.search(description+' '+motion):raise ValueError('Remove text/label/callout/logo/watermark instructions from description and motion. The tool adds exact text rules automatically.')
        if not isinstance(calls,list) or len(calls)!=spec['calloutCount']:raise ValueError(f"Scene {spec['scene']} requires exactly {spec['calloutCount']} callout objects, not {len(calls) if isinstance(calls,list) else 'a non-list'}.")
        labels=[];pairs=[]
        for c in calls:
            label=c.get('label','').strip();target=visual_text(c.get('target','').strip(),plan.get('script',''))
            if not label or not target or '\n' in label or len(label)>80:raise ValueError('Each callout needs a short label and a concrete visual target.')
            if label in labels:raise ValueError('Callout labels within one scene must be distinct.')
            labels.append(label);pairs.append('“'+label+'” pointing to '+target)
        if spec.get('labels') and labels!=spec['labels']:raise ValueError('Use the user-specified callout labels exactly, in their assigned order.')
        if calls:
            image_text=f"Add exactly {len(calls)} callouts with thin ivory leader lines and small circular endpoints: "+'; '.join(pairs)+'. Use clean ivory-white sans-serif typography. These callouts are the only visible text. No other text, numbers, logos or watermark.'
            video_text=f"Fade in exactly the same {len(calls)} callouts: "+'; '.join(pairs)+'. Anchor each leader line to its precise anatomical target throughout camera movement. Preserve exact wording and stable typography. No additional text or graphics.'
        else:
            image_text='No text, labels, callouts, symbols, letters, numbers, logos or watermark.'
            video_text='No text, labels, callouts or additional graphics.'
        image=STYLE+' '+description+' Keep decorative materials within the charcoal, ivory and restrained crimson/salmon palette. Maintain consistent anatomy, subject identity and lighting across the sequence. '+image_text
        video=motion+' Animate only the supplied still-image content and the narrated action. Preserve anatomy, proportions, material palette and lighting; no extra structures, instant duplication or fantasy effects. '+video_text
        blocks.append(f"Scene {spec['scene']:02d}\nImage Prompt: {image}\n\nImage-to-Video Prompt: {video}\n\nVoice: {spec['voice']}")
        total+=len(calls)
    content='\n\n'.join(blocks);profile=Path(__file__).resolve().parents[2];home=profile.parent.parent if profile.parent.name=='profiles' else profile
    target=Path(output_dir) if output_dir else home/'shared/aether-extractions';target.mkdir(parents=True,exist_ok=True)
    name=plan['outputName']
    if not re.fullmatch(r'medical-scenes-\d{8}-\d{6}-[a-f0-9]{10}\.txt',name):raise ValueError('Invalid generated scene output identity.')
    out=target/name;data=('\ufeff'+content.replace('\r\n','\n').replace('\n','\r\n')).encode('utf-8')
    if out.exists() and out.read_bytes()!=data:raise ValueError('A successful result already exists for this plan. Start a new task to revise; do not create multiple versions.')
    out.write_bytes(data)
    return {'success':True,'scene_count':len(blocks),'total_callouts':total,'voice_policy':'All assigned narration preserved in order, once; no rewriting.','files':[str(out)]}
