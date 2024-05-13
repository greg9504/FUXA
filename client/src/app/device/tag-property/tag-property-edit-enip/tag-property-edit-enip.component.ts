import { Component, EventEmitter, Inject, OnDestroy, OnInit, Output } from '@angular/core';
import { AbstractControl, FormGroup, UntypedFormBuilder, UntypedFormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Observable, Subject, takeUntil } from 'rxjs';
import { Device, DeviceType, EnipIODataType, EnipTagDataSourceType, EnipTypes, EthernetIPModule, Tag } from '../../../_models/device';
import { HmiService } from '../../../_services/hmi.service';
import { NestedTreeControl } from '@angular/cdk/tree';
import { MatTreeNestedDataSource } from '@angular/material/tree';


export enum EnipTreeNodeType {
  variable,
  global,
  program,
}
export class EnipTreeNode {
  constructor(
    public name: string,
    public nodeType: EnipTreeNodeType,
    public enipTag: any = undefined,
    public fuxaTag = undefined,
    public children: EnipTreeNode[] = []
  ) { }
}

@Component({
  selector: 'app-tag-property-edit-enip',
  templateUrl: './tag-property-edit-enip.component.html',
  styleUrls: ['./tag-property-edit-enip.component.css']
})
export class TagPropertyEditEnipComponent implements OnInit, OnDestroy {
  @Output() result = new EventEmitter<any>();
  formGroup: UntypedFormGroup;
  existingNames = [];

  error$: Observable<string>;// = this._error$.asObservable();
  treeControl = new NestedTreeControl<EnipTreeNode>(node => node.children);
  dataSource = new MatTreeNestedDataSource<EnipTreeNode>();
  activeNode: EnipTreeNode = undefined;
  isSymLoading: boolean = true;

  readonly EnipTagDataSourceType = EnipTagDataSourceType;
  readonly EnipTypes = EnipTypes;

  enipTagDataSourceType = [{ text: 'device.tag-enipType-symbolic', value: EnipTagDataSourceType.symbolic }, { text: 'device.tag-enipType-explicit', value: EnipTagDataSourceType.explicit },
  { text: 'device.tag-enipType-io', value: EnipTagDataSourceType.assemblyIO }, { text: 'device.tag-enipType-calculated' }];
  enipIODataType = [{ text: 'device.tag-enip-io-type-bit', value: EnipIODataType.bit }, { text: 'device.tag-enip-io-type-integer16', value: EnipIODataType.integer16 }];
  enipIOReadOrWriteType = [{ text: 'device.tag-enip-io-output-read', value: false }, { text: 'device.tag-enip-io-output-write', value: true }];

  private destroy$ = new Subject<void>();
  private _error$ = new BehaviorSubject('');
  private _error: string = '';

  constructor(private fb: UntypedFormBuilder,
    private translateService: TranslateService,
    private hmiService: HmiService,
    public dialogRef: MatDialogRef<TagPropertyEditEnipComponent>,
    @Inject(MAT_DIALOG_DATA) public data: TagProperty) {
      this.error$ = this._error$.asObservable();
    }

  ngOnInit() {
    for (let i = 0; i < this.enipTagDataSourceType.length; i++) {
      this.translateService.get(this.enipTagDataSourceType[i].text).subscribe((txt: string) => { this.enipTagDataSourceType[i].text = txt; });
    }
    for (let i = 0; i < this.enipIODataType.length; i++) {
      this.translateService.get(this.enipIODataType[i].text).subscribe((txt: string) => { this.enipIODataType[i].text = txt; });
    }
    for (let i = 0; i < this.enipIOReadOrWriteType.length; i++) {
      this.translateService.get(this.enipIOReadOrWriteType[i].text).subscribe((txt: string) => { this.enipIOReadOrWriteType[i].text = txt; });
    }
    if (this.data.tag.enipOptions === undefined) {
      this.data.tag.enipOptions = {
        tagType: EnipTagDataSourceType.symbolic,
        symbolicOpt: {
          program: undefined,
          dataType: undefined
        },
        explicitOpt: {
          class: undefined,
          instance: undefined,
          attribute: undefined,
          sendBuffer: undefined
        }, ioOpt: {
          ioType: EnipIODataType.bit,
          ioOutput: false,
          ioModuleId: undefined,
          ioBitOffset: 0,
          ioByteOffset: 0,
        }
      };
    } else if (this.data.tag.enipOptions.ioOpt === undefined) {
      this.data.tag.enipOptions.ioOpt = {
        ioType: EnipIODataType.bit,
        ioOutput: false,
        ioModuleId: undefined,
        ioBitOffset: 0,
        ioByteOffset: 0,
      };
    }
    // const enipOpt = this.data.tag.enipOptions as EnipTagOptions;

    this.formGroup = this.fb.group({
      deviceName: [this.data.device.name, Validators.required],
      tagName: [this.data.tag.name, [Validators.required, this.validateName()]],
      tagType: [this.data.tag.enipOptions.tagType, Validators.required],
      IO: this.fb.group({
        tagIOModule: [this.data.tag.enipOptions.ioOpt.ioModuleId, Validators.required],
        tagIOType: [this.data.tag.enipOptions.ioOpt.ioType, Validators.required],
        tagIOByteOffset: [this.data.tag.enipOptions.ioOpt.ioByteOffset, Validators.required],
        tagIOBitOffset: [this.data.tag.enipOptions.ioOpt.ioBitOffset, [Validators.required, Validators.min(0), Validators.max(7),]],
        tagIOOutput: [this.data.tag.enipOptions.ioOpt.ioOutput, Validators.required],
      }),
      Symbolic: this.fb.group({
        tagSymAddress: [this.data.tag.address, Validators.required],
        tagSymProgram: [this.data.tag.enipOptions.symbolicOpt.program],//optional
        tagSymDataType: [this.data.tag.enipOptions.symbolicOpt.dataType, Validators.required],
      }),
      Explicit: this.fb.group({
        tagExpClass: [this.data.tag.enipOptions.explicitOpt.class, Validators.required],
        tagExpInstance: [this.data.tag.enipOptions.explicitOpt.instance, Validators.required],
        tagExpAttribute: [this.data.tag.enipOptions.explicitOpt.attribute, Validators.required],
        tagExpSendBuffer: [this.data.tag.enipOptions.explicitOpt.sendBuffer, Validators.required],
      }),
      tagDescription: [this.data.tag.description],
      tagDivisor: [this.data.tag.divisor]
    });
    //listen for browsing of symbolic tags
    this.hmiService.onDeviceBrowse.pipe(
      takeUntil(this.destroy$),
    ).subscribe(values => {
      if (this.data.device.id === values.device) {
        try {
          if (values.error) {
            console.log(values.error);
            if (values?.error === 'Device not found!') {
              this._error = 'Device not enabled, unable to retrieve tags.  Enable device.';
            } else {
              this._error = values.error;
            }
            this._error$.next(this._error);
          } else {
            console.log(values);
            this.buildTreeNodes(values.result);
          }
        } catch (error) {
          this._error = error.toString();
          this._error$.next(this._error);
        }
        finally {
          this.isSymLoading = false;
        }
      }
    });
    // enable/disable some controls based on enip tagType, so only those visible will require validation
    this.formGroup.controls.tagType.valueChanges.pipe(
      takeUntil(this.destroy$)
    ).subscribe(enipTagType => {
      this.updateTagControls(enipTagType);
    });
    // need to run the enable/disable once on loading in case editing existing tag
    this.updateTagControls(this.formGroup.controls.tagType.value);

    this.formGroup.updateValueAndValidity();
    Object.keys(this.data.device.tags).forEach((key) => {
      let tag = this.data.device.tags[key];
      if (tag.id) {
        if (tag.id !== this.data.tag.id) {
          this.existingNames.push(tag.name);
        }
      } else if (tag.name !== this.data.tag.name) {
        this.existingNames.push(tag.name);
      }
    });
  }

  private buildTreeNodes(plcReadTagsResult: any) {
    /**
     * {
     *   tags: [{id, name, program, type{arrayDims, code, reserved, sintPos, structure, typeName}}...],
     *   programs?,
     *   structures: {}
     * }
     */
    // group tags by program, Micro800 series PLC only support global variable tags
    // PLC may not return all defined tags, so allow user to define tags that are not
    // in this list
    const tagsByProgram = {};
    for (const tag of plcReadTagsResult.tags) {
      const tagProgram = tag.program ? tag.program : 'Global Tags';
      let programTags = tagsByProgram[tagProgram];
      if (!(programTags instanceof Array)) {
        tagsByProgram[tagProgram] = programTags = [];
      }
      programTags.push(tag);
    }
    const nodes = [];
    for (const tagProgram in tagsByProgram) {
      const parentNode: EnipTreeNode = new EnipTreeNode(tagProgram, tagProgram === 'Global Tags' ? EnipTreeNodeType.global : EnipTreeNodeType.program);
      for (const tag of tagsByProgram[tagProgram]) {
        const tagNode: EnipTreeNode = new EnipTreeNode(tag.name, EnipTreeNodeType.variable, tag);
        parentNode.children.push(tagNode);
      }
      nodes.push(parentNode);
    }
    this.dataSource.data = nodes;
    this._error = '';
    this._error$.next(this._error);
  }
  onTagSelect(node: EnipTreeNode) {
    this.activeNode = node;
    console.log(node);
    this.getSymbolicCtrls().get('tagSymAddress').setValue(this.activeNode.name);
    this.getSymbolicCtrls().get('tagSymDataType').setValue(this.activeNode.enipTag.type.code);
    this.getSymbolicCtrls().get('tagSymProgram').setValue(this.activeNode.enipTag.program);
  }
  validateName(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      this._error = null;
      if (this.existingNames.indexOf(control.value) !== -1) {
        return { name: this.translateService.instant('msg.device-tag-exist') };
      }
      return null;
    };
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onNoClick(): void {
    this.result.emit();
  }

  onOkClick(): void {
    this.result.emit(this.formGroup.getRawValue());
  }
  hasSymError() {
    return this._error?.length > 0;
  }
  isGenericEthernetIp() {
    return (this.data.device.type === DeviceType.GenericEthernetIP) ? true : false;
  }
  isEnIpSymbolic() {
    return (this.isGenericEthernetIp() && (this.data.tag.enipOptions?.tagType === EnipTagDataSourceType.symbolic)) ? true : false;
  }
  isEnIpExplicit() {
    return (this.isGenericEthernetIp() && (this.data.tag.enipOptions?.tagType === EnipTagDataSourceType.explicit)) ? true : false;
  }
  isEnIpIO() {
    //return (this.formGroup.controls.tagType.value === EnipTagDataSourceType.assemblyIO);

    return (this.isGenericEthernetIp() && (this.data.tag.enipOptions?.tagType === EnipTagDataSourceType.assemblyIO)) ? true : false;
  }
  isEnIpIOTypeBit() {
    return (this.isGenericEthernetIp() && (this.data.tag?.enipOptions?.ioOpt?.ioType === EnipIODataType.bit)) ? true : false;
  }
  ethernetIpModules(): EthernetIPModule[] {
    return <EthernetIPModule[]>Object.values(this.data.device.modules);
  }
  updateTagControls(enipTagType: EnipTagDataSourceType) {
    switch (enipTagType) {
      case EnipTagDataSourceType.assemblyIO:
        this.enableDisableControls(this.getIOCtrls(), [this.getSymbolicCtrls(), this.getExplicitCtrls()]);
        break;
      case EnipTagDataSourceType.explicit:
        this.enableDisableControls(this.getExplicitCtrls(), [this.getSymbolicCtrls(), this.getIOCtrls()]);
        break;
      case EnipTagDataSourceType.symbolic:
        this.enableDisableControls(this.getSymbolicCtrls(), [this.getIOCtrls(), this.getExplicitCtrls()]);
        this.isSymLoading = true;
        this.hmiService.askDeviceBrowse(this.data.device.id, null);
        break;
    }
  }
  enableDisableControls(toEnable: FormGroup, toDisable: FormGroup[]) {
    for (const ctrl in toEnable.controls) {
      const control = toEnable.get(ctrl);
      control.enable();
    }
    for (const toDisableCtrls of toDisable) {
      for (const ctrl in toDisableCtrls.controls) {
        const control = toDisableCtrls.get(ctrl);
        control.disable();
      }
    }
  }
  getIOCtrls(): FormGroup {
    return this.formGroup.get('IO') as FormGroup;
  }
  getExplicitCtrls(): FormGroup {
    return this.formGroup.get('Explicit') as FormGroup;
  }
  getSymbolicCtrls(): FormGroup {
    return this.formGroup.get('Symbolic') as FormGroup;
  }
  hasChild = (_: number, node: EnipTreeNode) =>
    !!node.children && node.children.length > 0;

};

interface TagProperty {
  device: Device;
  tag: Tag;
};
