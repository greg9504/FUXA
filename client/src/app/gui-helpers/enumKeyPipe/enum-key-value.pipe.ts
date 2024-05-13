import { Pipe, PipeTransform } from '@angular/core';

//https://github.com/angular/angular/issues/41024#issuecomment-787990070
/**
 * use an enum in a ngFor
 */
@Pipe({ name: 'enumKeyValue' })
export class EnumKeyValuePipe implements PipeTransform {
  transform(obj: object) {
    return Object.entries(obj).
      filter(([key, value]) =>
        !/^\d+$/.test(key) ||         // Include keys that don't look like integers or...
        !obj.hasOwnProperty(value)).  // ...include keys whose values do not appear as keys also.
      map(([key, value]) => ({ key, value }));
  }
}
