import { Component, EventEmitter, Inject, OnDestroy, OnInit, Output } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, UntypedFormBuilder, UntypedFormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { Subject, takeUntil } from 'rxjs';
import { Device, DeviceType, EnipIODataType, EnipTagDataSourceType, EnipTagOptions, EthernetIPModule, Tag } from '../../../_models/device';

@Component({
  selector: 'app-tag-property-edit-enip',
  templateUrl: './tag-property-edit-enip.component.html',
  styleUrls: ['./tag-property-edit-enip.component.css']
})
export class TagPropertyEditEnipComponent implements OnInit, OnDestroy {
  @Output() result = new EventEmitter<any>();
  formGroup: UntypedFormGroup;
  existingNames = [];
  error: string;

  readonly EnipTagDataSourceType = EnipTagDataSourceType;

  enipTagDataSourceType = [{ text: 'device.tag-enipType-symbolic', value: EnipTagDataSourceType.symbolic }, { text: 'device.tag-enipType-explicit', value: EnipTagDataSourceType.explicit },
  { text: 'device.tag-enipType-io', value: EnipTagDataSourceType.assemblyIO }, { text: 'device.tag-enipType-calculated', value: EnipTagDataSourceType.calculated }];
  enipIODataType = [{ text: 'device.tag-enip-io-type-bit', value: EnipIODataType.bit }, { text: 'device.tag-enip-io-type-integer16', value: EnipIODataType.integer16 }];
  enipIOReadOrWriteType = [{ text: 'device.tag-enip-io-output-read', value: false }, { text: 'device.tag-enip-io-output-write', value: true }];

  private destroy$ = new Subject<void>();

  constructor(private fb: UntypedFormBuilder,
    private translateService: TranslateService,
    public dialogRef: MatDialogRef<TagPropertyEditEnipComponent>,
    @Inject(MAT_DIALOG_DATA) public data: TagProperty) { }

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
    if (this.isGenericEthernetIp()) {
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
    }
    this.formGroup = this.fb.group({
      deviceName: [this.data.device.name, Validators.required],
      tagName: [this.data.tag.name, [Validators.required, this.validateName()]],
      tagType: [this.data.tag.enipOptions.tagType, Validators.required],
      IO: this.fb.group ({
      tagIOModule: [this.data.tag.enipOptions.ioOpt.ioModuleId, Validators.required],
      tagIOType: [this.data.tag.enipOptions.ioOpt.ioType, Validators.required],
      tagIOByteOffset: [this.data.tag.enipOptions.ioOpt.ioByteOffset, Validators.required],
      tagIOBitOffset: [this.data.tag.enipOptions.ioOpt.ioBitOffset, [Validators.required, Validators.min(0), Validators.max(7),]],
      tagIOOutput: [this.data.tag.enipOptions.ioOpt.ioOutput, Validators.required],
      }),
      Symbolic: this.fb.group ({tagSymAddress: [this.data.tag.address, Validators.required],}),
      Explicit: this.fb.group ({
        tagExpClass: [this.data.tag.enipOptions.explicitOpt.class, Validators.required],
      tagExpInstance: [this.data.tag.enipOptions.explicitOpt.instance, Validators.required],
      tagExpAttribute: [this.data.tag.enipOptions.explicitOpt.attribute, Validators.required],
      tagExpSendBuffer: [this.data.tag.enipOptions.explicitOpt.sendBuffer, Validators.required],
      }),
      tagDescription: [this.data.tag.description],
      tagDivisor: [this.data.tag.divisor]
    });

    // enable/disable some controls based on enip tagType, so only those visible will require validation
    this.formGroup.controls.tagType.valueChanges.pipe(
      takeUntil(this.destroy$)
    ).subscribe(enipTagType => {
      this.updateTagControls(enipTagType);
    });
    // need to run the enable/disable once on loading in case editing
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

  validateName(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      this.error = null;
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
};

interface TagProperty {
  device: Device;
  tag: Tag;
};
