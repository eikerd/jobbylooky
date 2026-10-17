import { Component, computed, input, output, signal, effect, ElementRef, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import type { JobGroup, Opportunity } from './models';
import { buildProfiles } from './profiles';
import { Age } from './age.component';
import { ConvoHeat } from './convo-heat.component';
import { conversationHeat, conversationState } from './conversation';
import { interactions } from './interactions';
import { LocationMaps } from './location-maps.component';
import { officeLocations } from './location-map';

@Component({
  selector:'app-profiles',
  imports:[DatePipe, LocationMaps, Age, ConvoHeat],
  templateUrl:'./profiles.html',
  styleUrl:'./profiles.css',
})
export class Profiles {
  readonly groups = input.required<JobGroup[]>();
  readonly mode = input.required<'recruiters'|'companies'>();
  readonly focusId = input('');
  readonly openPitch = output<string>();
  readonly openRecruiter = output<string>();
  readonly openCompany = output<string>();
  readonly selectedId = signal('');
  readonly detail = viewChild<ElementRef<HTMLElement>>('detail');
  readonly directory = computed(()=>buildProfiles(this.groups()));
  readonly entries = computed(()=>this.mode()==='recruiters' ? this.directory().recruiters : this.directory().companies);
  readonly selected = computed(()=>this.entries().find(profile=>profile.id===this.selectedId()) || this.entries().at(0));
  readonly recruiter = computed(()=>this.mode()==='recruiters' ? this.directory().recruiters.find(p=>p.id===this.selected()?.id) : undefined);
  readonly company = computed(()=>this.directory().companies.find(p=>p.id===(this.recruiter()?.companyId || this.selected()?.id)));
  /** The company's offices: street addresses its recruiters sign with, commonest first. */
  readonly offices = computed(()=>officeLocations((this.company()?.pitches ?? []).map(pitch=>pitch.body)));
  constructor() {
    effect(()=>{this.mode(); this.selectedId.set(this.focusId()); this.detail()?.nativeElement.scrollTo({top:0});});
  }
  select(id:string) { this.selectedId.set(id); this.detail()?.nativeElement.scrollTo({top:0}); }
  companyLabel(id:string) { return this.directory().companies.find(p=>p.id===id)?.name || 'Unassigned company'; }
  /** This profile's own conversation on a job: another recruiter's emails on the same job are theirs, not this one's. */
  jobHeat(pitches: readonly Opportunity[]) {
    const state = conversationState(pitches);
    return state && conversationHeat(state, interactions(pitches, this.groups().flatMap((group) => group.pitches)));
  }
}
