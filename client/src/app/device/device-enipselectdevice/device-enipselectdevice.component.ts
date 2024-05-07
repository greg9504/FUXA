import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-device-enipselectdevice',
  templateUrl: './device-enipselectdevice.component.html',
  styleUrls: ['./device-enipselectdevice.component.css']
})
export class DeviceEnipselectdeviceComponent implements OnInit {

  typesOfShoes: string[] = ['Boots', 'Clogs', 'Loafers', 'Moccasins', 'Sneakers'];
  constructor(private translateService: TranslateService,
    public dialogRef: MatDialogRef<DeviceEnipselectdeviceComponent>,
		@Inject(MAT_DIALOG_DATA) public data: any) { }

  ngOnInit() {
    console.log('ngOnInit');
  }
  onNoClick(): void {
		this.dialogRef.close();
	}
  onOkClick(): void {

  }
}
