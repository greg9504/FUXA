import { Component, EventEmitter, Inject, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, UntypedFormBuilder, UntypedFormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Subject, of, takeUntil } from 'rxjs';
import { Device, DeviceType, EnipIODataType, EnipTagDataSourceType, EnipTagOptions, EthernetIPModule, Tag } from '../../../_models/device';
import { HmiService } from '../../../_services/hmi.service';
import { TreetableComponent, Node, NodeType, TreeType } from '../../../gui-helpers/treetable/treetable.component';
import { Utils } from '../../../_helpers/utils';
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
  error: string = 'Greg';
  private _error$ = new BehaviorSubject('');
  public error$ = this._error$.asObservable();
  // config = { width: '100%', height: '600px', type: TreeType.ToDefine };
  // @ViewChild(TreetableComponent, {static: false}) treetable: TreetableComponent;
  treeControl = new NestedTreeControl<EnipTreeNode>(node => node.children);
  dataSource = new MatTreeNestedDataSource<EnipTreeNode>();
  activeNode: EnipTreeNode = undefined;

  readonly EnipTagDataSourceType = EnipTagDataSourceType;

  enipTagDataSourceType = [{ text: 'device.tag-enipType-symbolic', value: EnipTagDataSourceType.symbolic }, { text: 'device.tag-enipType-explicit', value: EnipTagDataSourceType.explicit },
  { text: 'device.tag-enipType-io', value: EnipTagDataSourceType.assemblyIO }, { text: 'device.tag-enipType-calculated', value: EnipTagDataSourceType.calculated }];
  enipIODataType = [{ text: 'device.tag-enip-io-type-bit', value: EnipIODataType.bit }, { text: 'device.tag-enip-io-type-integer16', value: EnipIODataType.integer16 }];
  enipIOReadOrWriteType = [{ text: 'device.tag-enip-io-output-read', value: false }, { text: 'device.tag-enip-io-output-write', value: true }];

  private destroy$ = new Subject<void>();

  constructor(private fb: UntypedFormBuilder,
    private translateService: TranslateService,
    private hmiService: HmiService,
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
      IO: this.fb.group({
        tagIOModule: [this.data.tag.enipOptions.ioOpt.ioModuleId, Validators.required],
        tagIOType: [this.data.tag.enipOptions.ioOpt.ioType, Validators.required],
        tagIOByteOffset: [this.data.tag.enipOptions.ioOpt.ioByteOffset, Validators.required],
        tagIOBitOffset: [this.data.tag.enipOptions.ioOpt.ioBitOffset, [Validators.required, Validators.min(0), Validators.max(7),]],
        tagIOOutput: [this.data.tag.enipOptions.ioOpt.ioOutput, Validators.required],
      }),
      Symbolic: this.fb.group({
        tagSymAddress: [this.data.tag.address, Validators.required],
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

    this.hmiService.onDeviceBrowse.pipe(
      takeUntil(this.destroy$),
    ).subscribe(values => {
      if (this.data.device.id === values.device) {
        if (values.error) {
          //this.addError(values.node, values.error);
          console.log(values.error);
          if (values?.error === 'Device not found!') {
            this.error = 'Device not enabled, unable to retrieve tags.  Enable device.';
          } else {
            this.error = values.error;
          }
          this._error$.next(this.error);// = of(this.error);
        } else {
          const globalVarParent = new Node('0', 'Global Variable Tags');
          console.log(values);
          this.buildTreeNodes(values.result);
        }
      }
    });
    // let n = (node) ? { id: node.id } : null;
    //       if (this.isBACnet() && node) {
    //           n['parent'] = (node.parent) ? node.parent.id : null;
    //       }
    //      this.hmiService.askDeviceBrowse(this.data.device.id, null);
    this.queryNext(null);
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
    this.error = '';
  }
  onTagSelect(node: EnipTreeNode) {
    this.activeNode = node;
    console.log(node);
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
    // this.data.nodes = [];
    //     if (this.isWebApi() || this.isOdbc()) {
    //         let result = this.getSelectedTreeNodes(Object.values(this.treetable.nodes), null);
    //         result.forEach((n: Node) => {
    //             if (n.checked && n.enabled) {
    //                 this.data.nodes.push(n);
    //             }
    //         });
    //         // this.data.nodes = result;
    //     }

    //     Object.keys(this.treetable.nodes).forEach((key) => {
    //       let n: Node = this.treetable.nodes[key];
    //       if (n.checked && n.enabled && (n.type || !n.childs || n.childs.length == 0)) {
    //           this.data.nodes.push(this.treetable.nodes[key]);
    //       }
    //   });

    this.result.emit(this.formGroup.getRawValue());
  }
  hasSymError() {
    return this.error?.length > 0;
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
  hasChild = (_: number, node: EnipTreeNode) =>
    !!node.children && node.children.length > 0;


  // getSelectedTreeNodes(nodes: Array<Node>, defined: any): Array<Node> {
  //     let result = [];
  //     for (let key in nodes) {
  //         let n: Node = nodes[key];
  //         if (n.class === NodeType.Array && n.todefine && n.todefine.id && n.todefine.value) {
  //             let arrayResult = this.getSelectedTreeNodes(n.childs, n.todefine);
  //             for (let ak in arrayResult) {
  //                 result.push(arrayResult[ak]);
  //             }
  //         } else if (n.class === NodeType.Object && defined && defined.id && defined.value) {
  //             // search defined attributes
  //             let childId = null, childValue = null;
  //             for (let childKey in n.childs)
  //             {
  //                 let child = n.childs[childKey];
  //                 if (child.text === defined.id) {
  //                     childId = child;
  //                 } else if (child.text === defined.value) {
  //                     childValue = child;
  //                 }
  //             }
  //             if (childId && childValue) {
  //                 let objNode = new Node(childId.id, childId.property);  // node array element (id: id:id, text: current id value)
  //                 objNode.class = NodeType.Reference;                     // to check
  //                 objNode.property = childValue.id;                        // value:id
  //                 objNode.todefine = { selid: childId.text, selval: childValue.text };
  //                 objNode.type = Utils.getType(childValue.property);
  //                 objNode.checked = true;
  //                 objNode.enabled = n.enabled;
  //                 const exist = Object.values(this.data.device.tags).find((tag: Tag) => tag.address === objNode.id && tag.memaddress === objNode.property);
  //                 if (exist) {
  //                     objNode.enabled = false;
  //                 }
  //                 result.push(objNode);
  //             }
  //         } else if (n.class === NodeType.Variable && n.checked) {
  //             // let objNode = new Node(n.id.split('>').join(''), n.text);
  //             let objNode = new Node(n.id, n.text);
  //             objNode.type = Utils.getType(n.property); //this.isOdbc() ? n.type : Utils.getType(n.property);
  //             objNode.checked = n.checked;
  //             objNode.enabled = n.enabled;
  //             result.push(objNode);
  //         }
  //     }
  //     return result;
  // }
  queryNext(node: Node) {
    // let n = (node) ? { id: node.id } : null;
    // if (this.isBACnet() && node) {
    //     n['parent'] = (node.parent) ? node.parent.id : null;
    // }
    this.hmiService.askDeviceBrowse(this.data.device.id, null);
  }

};

interface TagProperty {
  device: Device;
  tag: Tag;
};
