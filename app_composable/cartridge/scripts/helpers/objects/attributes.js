//Convert one attribute to JSON. Example: contentAsset.custom.body
function convertAttributeToJSON(attribute) {

    let jsonAttribute;

    if (attribute instanceof Array) {
      
      jsonAttribute = [];

      for (let i = 0; i < attribute.length; i++) {
        if (attribute[i] instanceof dw.value.EnumValue) {
          if (attribute[i].value) {
            jsonAttribute.push(attribute[i].value);
          }
        } else {
          //This inserts the entire array into the JSON
          jsonAttribute = attribute;
        }
      }
      
    } else if (attribute instanceof dw.content.MediaFile) {
      
      jsonAttribute = {};
      jsonAttribute._type = 'media_file'

      if (attribute.absURL) {

        let absUrlString = attribute.absURL.abs().toString();
        jsonAttribute.abs_url = absUrlString;
        let absUrlSplit = absUrlString.split('/');
        let fileName = absUrlSplit[absUrlSplit.length - 1];
        jsonAttribute.path = fileName;
        
      }
      //gets media value from CDN
      var imageURL = attribute.getAbsImageURL( { scaleWidth: 100 } ).toString().replace('?sw=100','');
      jsonAttribute.dis_base_url = imageURL;

    } else if (attribute instanceof dw.value.EnumValue) {
      
      jsonAttribute = attribute.value;

    } else if (attribute instanceof dw.content.MarkupText) {
      //Code for HTML type of attribute
      jsonAttribute = {};
      jsonAttribute._type = 'markup_text';

      if (attribute.markup) {
        jsonAttribute.markup = attribute.markup;
      }

      if (attribute.source) {
        jsonAttribute.source = attribute.source;
      }
    } else {
        //If it's not a special attribute type just use the regular value from the attribute
        jsonAttribute = attribute;
    }

    return jsonAttribute;
}

module.exports = { convertAttributeToJSON }